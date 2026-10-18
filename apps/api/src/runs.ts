import type { ClipDecision, RunDetailResponse, RunListResponse } from "@clearframe/contracts";
import type { LambdaFunctionURLEvent } from "aws-lambda";
import { type AccessTokenVerifier, authenticate } from "./auth";
import type { ResponseSink } from "./compose";
import { sendJson } from "./respond";
import type { RunHistory } from "./run-store";

export interface RunsDeps {
  verifier: () => Promise<AccessTokenVerifier>;
  history: RunHistory;
}

/** How many past runs GET /api/runs returns, newest first. */
export const RUN_LIST_LIMIT = 20;

const UNAUTHORIZED = { error: "Sign in again: the access token is missing, invalid or expired" };

/** GET /api/runs: the caller's own runs. */
export async function listRuns(
  event: LambdaFunctionURLEvent,
  deps: RunsDeps,
  sink: ResponseSink,
): Promise<void> {
  const principal = await authenticate(event.headers, await deps.verifier());
  if (!principal) return sendJson(sink, 401, UNAUTHORIZED);
  const runs = await deps.history.listRuns(principal.userId, RUN_LIST_LIMIT);
  return sendJson(sink, 200, { runs } satisfies RunListResponse);
}

/**
 * GET /api/runs/:id. Another user's run answers 404, like a missing one, so ids cannot be probed.
 * The manifest is the version the run wrote, read back from S3, not a copy the page kept.
 */
export async function getRun(
  event: LambdaFunctionURLEvent,
  runId: string,
  deps: RunsDeps,
  sink: ResponseSink,
): Promise<void> {
  const principal = await authenticate(event.headers, await deps.verifier());
  if (!principal) return sendJson(sink, 401, UNAUTHORIZED);

  const record = await deps.history.findRun(runId);
  if (!record || record.userId !== principal.userId) {
    return sendJson(sink, 404, { error: "No run with this id" });
  }
  const stored = await deps.history.readManifest(record);
  if (!stored) {
    return sendJson(sink, 422, {
      error: "This run was recorded in an earlier manifest format, which this page cannot show.",
    });
  }

  const { manifest, verified } = stored;
  const decisions: ClipDecision[] = [
    ...manifest.clips.map(({ clipId, title, genre, language, durationSec }) => ({
      clipId,
      title,
      genre,
      language,
      durationSec,
      outcome: "accepted" as const,
      reasons: [],
    })),
    ...manifest.rejected.map(({ clipId, reasons }) => ({
      clipId,
      title: null,
      genre: null,
      language: null,
      durationSec: null,
      outcome: "refused" as const,
      reasons,
    })),
  ];
  return sendJson(sink, 200, {
    manifest,
    steps: record.steps,
    decisions,
    createdAt: record.createdAt,
    audit: {
      manifestVersionId: record.manifestVersionId ?? null,
      manifestSha256: record.manifestSha256 ?? null,
      verified,
    },
  } satisfies RunDetailResponse);
}
