import type { FinishReason } from "ai";
import type { CatalogData } from "../catalog/load";
import { MAX_STEPS, TOKEN_BUDGET, createClipAgent } from "./agent";
import type { RunContext } from "./context";
import { estimateCostUsd } from "./cost";
import type { UsageRequest } from "../rights/check-training-rights";
import {
  type Manifest,
  ManifestDraft,
  ManifestSchema,
  type ManifestWriter,
  type StopReason,
} from "./manifest";

export const RunRequestSchema = ManifestSchema.shape.request;

export interface RunRequest {
  prompt: string;
  territory: string;
  date: string;
}

export interface StepLog {
  stepNumber: number;
  toolCalls: string[];
  inputTokens: number;
  outputTokens: number;
}

export interface RunDeps {
  data: CatalogData;
  embedQuery: RunContext["embedQuery"];
  onStep?: (step: StepLog) => void;
  /** Eval-only seam for the no-rule ablation; production always uses ManifestDraft. */
  createDraft?: (data: CatalogData, usage: UsageRequest) => ManifestWriter;
}

/** The loop ends on its own only when the model answers with text instead of a tool call. */
export function stopReasonOf(finishReason: FinishReason, totalTokens: number): StopReason {
  if (finishReason !== "tool-calls") return "completed";
  return totalTokens >= TOKEN_BUDGET ? "token_budget" : "step_limit";
}

export async function runClipAgent(request: RunRequest, deps: RunDeps): Promise<Manifest> {
  const startedAt = performance.now();
  const { prompt, territory, date } = RunRequestSchema.parse(request);

  const createDraft =
    deps.createDraft ?? ((data, usage) => new ManifestDraft(data.clipsById, usage));
  const run: RunContext = {
    data: deps.data,
    draft: createDraft(deps.data, { territory, date }),
    embedQuery: deps.embedQuery,
    stats: { embeddingTokens: 0 },
  };

  const result = await createClipAgent(run).generate({
    prompt,
    onStepEnd: ({ stepNumber, usage, toolCalls }) =>
      deps.onStep?.({
        stepNumber,
        toolCalls: toolCalls.map((call) => call.toolName),
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
      }),
  });

  const tokens = {
    inputTokens: result.totalUsage.inputTokens ?? 0,
    outputTokens: result.totalUsage.outputTokens ?? 0,
    embeddingTokens: run.stats.embeddingTokens,
  };
  const stopReason = stopReasonOf(result.finishReason, tokens.inputTokens + tokens.outputTokens);
  const summary =
    stopReason === "completed"
      ? result.text
      : `Stopped early (${stopReason}) after ${result.steps.length} of ${MAX_STEPS} steps; ` +
        "the manifest is partial.";

  return ManifestSchema.parse({
    request: { prompt, territory, date },
    clips: run.draft.entries,
    rejected: run.draft.rejections,
    stopReason,
    summary,
    usage: { steps: result.steps.length, ...tokens },
    costUsd: Math.round(estimateCostUsd(tokens) * 1e6) / 1e6,
    durationMs: Math.round(performance.now() - startedAt),
  });
}
