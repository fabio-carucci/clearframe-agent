import { randomUUID } from "node:crypto";
import {
  type ClipDecision,
  type Manifest,
  ManifestSchema,
  type RunEvent,
  type Step,
  type StopReason,
} from "@clearframe/contracts";
import type { FinishReason, LanguageModel } from "ai";
import type { z } from "zod";
import type { CatalogData } from "../catalog/load";
import type { UsageRequest } from "../rights/check-training-rights";
import { MAX_STEPS, RUN_TIMEOUT_MS, TOKEN_BUDGET, createClipAgent } from "./agent";
import type { RunContext } from "./context";
import { estimateCostUsd } from "./cost";
import { DecisionLog } from "./decisions";
import { type RunError, toRunError } from "./errors";
import { ManifestDraft, type ManifestWriter } from "./manifest";

export const RunRequestSchema = ManifestSchema.shape.request;

export type RunRequest = z.infer<typeof RunRequestSchema>;

export interface RunResult {
  manifest: Manifest;
  steps: Step[];
  decisions: ClipDecision[];
  error?: RunError;
}

export interface RunDeps {
  data: CatalogData;
  embedQuery: RunContext["embedQuery"];
  runId?: string;
  /** The model to run; the CLI and evals use the default Anthropic provider. */
  model?: LanguageModel;
  timeoutMs?: number;
  /** Receives every event of the run as it happens, ending with `completed`. */
  onEvent?: (event: RunEvent) => void;
  /** Eval-only seam for the no-rule ablation; production always uses ManifestDraft. */
  createDraft?: (data: CatalogData, usage: UsageRequest) => ManifestWriter;
}

/** The loop ends on its own only when the model answers with text instead of a tool call. */
export function stopReasonOf(finishReason: FinishReason, totalTokens: number): StopReason {
  if (finishReason !== "tool-calls") return "completed";
  return totalTokens >= TOKEN_BUDGET ? "token_budget" : "step_limit";
}

const sum = (steps: Step[], key: "inputTokens" | "outputTokens") =>
  steps.reduce((total, step) => total + step[key], 0);

/**
 * Runs the agent and always returns a validated manifest. When the model or a provider fails
 * mid-run, the clips accepted so far are kept and the manifest says why it is partial.
 */
export async function runClipAgent(request: RunRequest, deps: RunDeps): Promise<RunResult> {
  const startedAt = performance.now();
  const runId = deps.runId ?? randomUUID();
  const { prompt, territory, date } = RunRequestSchema.parse(request);

  const createDraft =
    deps.createDraft ?? ((data, usage) => new ManifestDraft(data.clipsById, usage));
  const emit = (event: RunEvent) => {
    try {
      deps.onEvent?.(event);
    } catch {
      // A listener that fails, such as a stream the client closed, must not stop the run:
      // it still has to finish and be recorded.
    }
  };

  const run: RunContext = {
    data: deps.data,
    draft: createDraft(deps.data, { territory, date }),
    decisions: new DecisionLog(deps.data.clipsById),
    embedQuery: deps.embedQuery,
    emit,
    stats: { embeddingTokens: 0 },
  };
  emit({ type: "started", runId, request: { prompt, territory, date } });

  const steps: Step[] = [];
  let stepStartedAt = performance.now();
  let outcome: { finishReason: FinishReason; text: string } | { error: RunError };

  try {
    const result = await createClipAgent(run, deps.model).generate({
      prompt,
      timeout: { totalMs: deps.timeoutMs ?? RUN_TIMEOUT_MS },
      onStepEnd: ({ stepNumber, usage, toolCalls }) => {
        const now = performance.now();
        const step: Step = {
          stepNumber,
          toolCalls: toolCalls.map((call) => call.toolName),
          inputTokens: usage.inputTokens ?? 0,
          outputTokens: usage.outputTokens ?? 0,
          durationMs: Math.round(now - stepStartedAt),
        };
        stepStartedAt = now;
        steps.push(step);
        emit({ type: "step", step });
      },
    });
    outcome = { finishReason: result.finishReason, text: result.text };
  } catch (error) {
    outcome = { error: toRunError(error) };
  }

  const tokens = {
    inputTokens: sum(steps, "inputTokens"),
    outputTokens: sum(steps, "outputTokens"),
    embeddingTokens: run.stats.embeddingTokens,
  };

  let stopReason: StopReason;
  let summary: string;
  if ("error" in outcome) {
    stopReason = "error";
    summary = `Run failed after ${steps.length} steps (${outcome.error.code}); the manifest is partial.`;
  } else {
    stopReason = stopReasonOf(outcome.finishReason, tokens.inputTokens + tokens.outputTokens);
    summary =
      stopReason === "completed"
        ? outcome.text
        : `Stopped early (${stopReason}) after ${steps.length} of ${MAX_STEPS} steps; ` +
          "the manifest is partial.";
  }

  const manifest = ManifestSchema.parse({
    runId,
    request: { prompt, territory, date },
    catalogVersion: deps.data.version,
    clips: run.draft.entries,
    rejected: run.draft.rejections,
    stopReason,
    summary,
    usage: { steps: steps.length, ...tokens },
    costUsd: Math.round(estimateCostUsd(tokens) * 1e6) / 1e6,
    durationMs: Math.round(performance.now() - startedAt),
  });

  const decisions = run.decisions.final();
  emit({ type: "completed", result: { manifest, steps, decisions } });

  return { manifest, steps, decisions, ...("error" in outcome && { error: outcome.error }) };
}
