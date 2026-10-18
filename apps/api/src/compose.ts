import { randomUUID } from "node:crypto";
import type { RunDeps, runClipAgent } from "@clearframe/core/agent/run";
import type { CatalogData } from "@clearframe/core/catalog/load";
import type { LambdaFunctionURLEvent } from "aws-lambda";
import { type AccessTokenVerifier, authenticate } from "./auth";
import { parseRunRequest } from "./request";
import type { RunStore } from "./run-store";

export const NDJSON = "application/x-ndjson";

/** Where the response goes: a Lambda response stream in production, memory in tests. */
export interface ResponseSink {
  /** Sends the status line and headers; must be called once, before any write. */
  start(statusCode: number, contentType: string): void;
  write(chunk: string): void;
  end(): Promise<void>;
}

export interface ComposeDeps {
  verifier: () => Promise<AccessTokenVerifier>;
  catalog: () => Promise<CatalogData>;
  embedQuery: RunDeps["embedQuery"];
  runAgent: typeof runClipAgent;
  store: RunStore;
  log: (event: string, fields?: Record<string, unknown>) => void;
  now: () => Date;
}

function parseJsonBody(event: LambdaFunctionURLEvent): unknown {
  if (!event.body) return undefined;
  const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString() : event.body;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/**
 * Handles POST /api. Clients that accept application/x-ndjson get every run event as one JSON
 * line as it happens, ending with `completed`; others get the final result as one JSON body.
 */
export async function compose(
  event: LambdaFunctionURLEvent,
  deps: ComposeDeps,
  sink: ResponseSink,
): Promise<void> {
  const sendJson = async (statusCode: number, body: unknown) => {
    sink.start(statusCode, "application/json");
    sink.write(JSON.stringify(body));
    await sink.end();
  };

  if (event.requestContext.http.method !== "POST") {
    return sendJson(405, { error: "Use POST with a JSON body" });
  }

  const principal = await authenticate(event.headers, await deps.verifier());
  if (!principal) {
    return sendJson(401, {
      error: "Sign in again: the access token is missing, invalid or expired",
    });
  }

  const createdAt = deps.now();
  const request = parseRunRequest(parseJsonBody(event), createdAt.toISOString().slice(0, 10));
  if (!request.ok) {
    return sendJson(400, { error: request.error, issues: request.issues });
  }

  // Load before the status line goes out: once a stream has started, a failure can no longer
  // be reported as an HTTP error.
  const data = await deps.catalog();
  const streaming = event.headers.accept?.includes(NDJSON) ?? false;
  const runId = randomUUID();
  const { userId } = principal;
  const { prompt, territory, date } = request;
  deps.log("run_started", { runId, userId, territory, date });
  if (streaming) sink.start(200, NDJSON);

  const result = await deps.runAgent(
    { prompt, territory, date },
    {
      data,
      embedQuery: deps.embedQuery,
      runId,
      onEvent: (runEvent) => {
        if (runEvent.type === "step") deps.log("step", { runId, ...runEvent.step });
        if (streaming) sink.write(`${JSON.stringify(runEvent)}\n`);
      },
    },
  );
  const { manifest, steps, decisions } = result;

  try {
    await deps.store.save(result, createdAt, userId);
  } catch (error) {
    deps.log("trace_failed", { runId, error: String(error) });
  }

  deps.log("run_finished", {
    runId,
    userId,
    stopReason: manifest.stopReason,
    clipCount: manifest.clips.length,
    rejectedCount: manifest.rejected.length,
    costUsd: manifest.costUsd,
    durationMs: manifest.durationMs,
    ...(result.error && { errorCode: result.error.code, errorMessage: result.error.message }),
  });

  if (streaming) return sink.end();
  return sendJson(manifest.stopReason === "error" ? 502 : 200, { manifest, steps, decisions });
}
