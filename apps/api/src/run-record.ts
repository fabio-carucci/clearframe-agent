import type { Step } from "@clearframe/contracts";
import type { RunResult } from "@clearframe/core/agent/run";

export const RUN_TTL_DAYS = 90;

/** One DynamoDB item per agent run. The full manifest lives in S3 under `manifestKey`. */
export interface RunRecord {
  runId: string;
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
  /** SHA-256 of the catalog, licenses included, that the run's clips were cleared against. */
  catalogVersion: string;
  stopReason: string;
  clipCount: number;
  rejectedCount: number;
  steps: Step[];
  inputTokens: number;
  outputTokens: number;
  embeddingTokens: number;
  costUsd: number;
  durationMs: number;
  manifestKey: string;
  /**
   * The locked S3 version and SHA-256 of the manifest written for this run. A later write to the
   * same key makes a new current version; these identify the one the run produced.
   */
  manifestVersionId: string;
  manifestSha256: string;
  errorCode?: string;
  /** Internal only: may name ARNs or accounts, never returned to API callers. */
  errorMessage?: string;
}

export const manifestKeyFor = (runId: string, createdAt: Date) =>
  `manifests/${createdAt.toISOString().slice(0, 10)}/${runId}.json`;

/** A run record before its manifest is stored, which gives it the version and checksum. */
export type RunRecordDraft = Omit<RunRecord, "manifestVersionId" | "manifestSha256">;

/** A record as read back: runs saved before manifests carried a version and checksum lack them. */
export type StoredRunRecord = RunRecordDraft & Partial<RunRecord>;

/** The index that lists a user's runs, newest first. */
export const RUNS_BY_USER_INDEX = "byUser";

export function toRunRecord(result: RunResult, createdAt: Date, userId: string): RunRecordDraft {
  const { manifest, steps, error } = result;
  return {
    runId: manifest.runId,
    createdAt: createdAt.toISOString(),
    expiresAt: Math.floor(createdAt.getTime() / 1000) + RUN_TTL_DAYS * 86_400,
    status: manifest.stopReason === "error" ? "error" : "ok",
    userId,
    model: result.model,
    ...manifest.request,
    catalogVersion: manifest.catalogVersion,
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
