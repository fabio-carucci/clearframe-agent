import { MODEL_ID } from "../agent/agent";
import type { RunResult, StepTrace } from "../agent/run";

export const RUN_TTL_DAYS = 90;

/** One DynamoDB item per agent run. The full manifest lives in S3 under `manifestKey`. */
export interface RunRecord {
  runId: string;
  /** Partition key of the byDay index: list a day's runs in createdAt order. */
  day: string;
  createdAt: string;
  /** Epoch seconds; DynamoDB TTL deletes the item after this. */
  expiresAt: number;
  status: "ok" | "error";
  /** Cognito subject of the caller, so cost can be attributed per user. */
  userId: string;
  model: string;
  prompt: string;
  territory: string;
  date: string;
  stopReason: string;
  clipCount: number;
  rejectedCount: number;
  steps: StepTrace[];
  inputTokens: number;
  outputTokens: number;
  embeddingTokens: number;
  costUsd: number;
  durationMs: number;
  manifestKey: string;
  errorCode?: string;
  /** Internal only: may name ARNs or accounts, never returned to API callers. */
  errorMessage?: string;
}

export const manifestKeyFor = (runId: string, createdAt: Date) =>
  `manifests/${createdAt.toISOString().slice(0, 10)}/${runId}.json`;

export function toRunRecord(result: RunResult, createdAt: Date, userId: string): RunRecord {
  const { manifest, steps, error } = result;
  return {
    runId: manifest.runId,
    day: createdAt.toISOString().slice(0, 10),
    createdAt: createdAt.toISOString(),
    expiresAt: Math.floor(createdAt.getTime() / 1000) + RUN_TTL_DAYS * 86_400,
    status: manifest.stopReason === "error" ? "error" : "ok",
    userId,
    model: MODEL_ID,
    ...manifest.request,
    stopReason: manifest.stopReason,
    clipCount: manifest.clips.length,
    rejectedCount: manifest.rejected.length,
    steps,
    inputTokens: manifest.usage.inputTokens,
    outputTokens: manifest.usage.outputTokens,
    embeddingTokens: manifest.usage.embeddingTokens,
    costUsd: manifest.costUsd,
    durationMs: manifest.durationMs,
    manifestKey: manifestKeyFor(manifest.runId, createdAt),
    ...(error && { errorCode: error.code, errorMessage: error.message }),
  };
}
