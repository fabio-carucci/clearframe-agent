import type { LambdaFunctionURLEvent } from "aws-lambda";
import { type ComposeDeps, type ResponseSink, compose } from "./compose";
import { sendJson } from "./respond";
import { type RunsDeps, getRun, listRuns } from "./runs";

export type ApiDeps = ComposeDeps & RunsDeps;

const RUN_PATH = /^\/api\/runs\/([0-9a-f-]{36})$/;

/** The three routes behind /api; anything else is 404, or 405 for a known path. */
export async function route(
  event: LambdaFunctionURLEvent,
  deps: ApiDeps,
  sink: ResponseSink,
): Promise<void> {
  const { method } = event.requestContext.http;
  const path = event.rawPath;
  if (path === "/api") return compose(event, deps, sink);

  const runId = RUN_PATH.exec(path)?.[1];
  if (path === "/api/runs" || runId) {
    if (method !== "GET") return sendJson(sink, 405, { error: "Use GET" });
    return runId ? getRun(event, runId, deps, sink) : listRuns(event, deps, sink);
  }
  return sendJson(sink, 404, { error: "Not found" });
}
