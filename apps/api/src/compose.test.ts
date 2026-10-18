import type { RunEvent } from "@clearframe/contracts";
import type { RunResult } from "@clearframe/core/agent/run";
import type { CatalogData } from "@clearframe/core/catalog/load";
import type { LanguageModel } from "ai";
import type { LambdaFunctionURLEvent } from "aws-lambda";
import { describe, expect, it, vi } from "vitest";
import { ACCESS_TOKEN_HEADER } from "./auth";
import { type ComposeDeps, NDJSON, type ResponseSink, compose } from "./compose";

const result: RunResult = {
  manifest: {
    runId: "11111111-1111-4111-8111-111111111111",
    request: { prompt: "surf", territory: "ES", date: "2026-10-18" },
    catalogVersion: "ae337fe9b6fb3434c13d8a6de17a56298b3b6908599774d835066eac4e17f0bc",
    clips: [],
    rejected: [],
    stopReason: "completed",
    summary: "done",
    usage: { steps: 1, inputTokens: 10, outputTokens: 1, embeddingTokens: 0 },
    costUsd: 0.000001,
    durationMs: 5,
  },
  steps: [{ stepNumber: 0, toolCalls: [], inputTokens: 10, outputTokens: 1, durationMs: 5 }],
  decisions: [],
};

function event(overrides: { method?: string; body?: unknown; headers?: Record<string, string> }) {
  return {
    requestContext: { http: { method: overrides.method ?? "POST" } },
    headers: { [ACCESS_TOKEN_HEADER]: "valid", ...overrides.headers },
    body: JSON.stringify(overrides.body ?? { prompt: "surf", territory: "ES" }),
    isBase64Encoded: false,
  } as unknown as LambdaFunctionURLEvent;
}

function harness(runResult: RunResult = result) {
  const sink = { status: 0, contentType: "", chunks: [] as string[], ended: false };
  const responseSink: ResponseSink = {
    start: (status, contentType) => Object.assign(sink, { status, contentType }),
    write: (chunk) => void sink.chunks.push(chunk),
    end: async () => void (sink.ended = true),
  };
  const save = vi.fn(async () => ({}) as never);
  const consume = vi.fn(async () => true);
  const deps: ComposeDeps = {
    verifier: async () => ({
      verify: async (token) => {
        if (token !== "valid") throw new Error("bad");
        return { sub: "user-1" };
      },
    }),
    model: async () => ({}) as LanguageModel,
    catalog: async () => ({}) as CatalogData,
    embedQuery: async () => ({ embedding: [], tokens: 0 }),
    runAgent: async (_request, runDeps) => {
      const started: RunEvent = {
        type: "started",
        runId: runResult.manifest.runId,
        request: runResult.manifest.request,
      };
      runDeps.onEvent?.(started);
      runDeps.onEvent?.({ type: "completed", result: runResult });
      return runResult;
    },
    quota: { consume },
    store: { save },
    log: () => {},
    now: () => new Date("2026-10-18T10:00:00Z"),
  };
  return { sink, responseSink, deps, save, consume };
}

describe("compose", () => {
  it("rejects methods other than POST", async () => {
    const { sink, responseSink, deps } = harness();
    await compose(event({ method: "GET" }), deps, responseSink);
    expect(sink.status).toBe(405);
  });

  it("rejects a request without a valid access token before doing any work", async () => {
    const { sink, responseSink, deps, save } = harness();
    const catalog = vi.spyOn(deps, "catalog");
    await compose(event({ headers: { [ACCESS_TOKEN_HEADER]: "forged" } }), deps, responseSink);
    expect(sink.status).toBe(401);
    expect(catalog).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it("rejects an invalid body with 400, without spending the user's quota", async () => {
    const { sink, responseSink, deps, consume } = harness();
    await compose(event({ body: { prompt: "surf", territory: "Spain" } }), deps, responseSink);
    expect(sink.status).toBe(400);
    expect(consume).not.toHaveBeenCalled();
  });

  it("answers 429 without loading anything once the user's daily quota is used up", async () => {
    const { sink, responseSink, deps, consume, save } = harness();
    consume.mockResolvedValueOnce(false);
    const catalog = vi.spyOn(deps, "catalog");
    await compose(event({}), deps, responseSink);
    expect(sink.status).toBe(429);
    expect(consume).toHaveBeenCalledWith("user-1", new Date("2026-10-18T10:00:00Z"));
    expect(catalog).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it("answers with one JSON body when the client does not ask for a stream", async () => {
    const { sink, responseSink, deps, save } = harness();
    await compose(event({}), deps, responseSink);
    expect(sink).toMatchObject({ status: 200, contentType: "application/json", ended: true });
    expect(JSON.parse(sink.chunks.join(""))).toEqual({
      manifest: result.manifest,
      steps: result.steps,
      decisions: result.decisions,
    });
    expect(save).toHaveBeenCalledWith(result, expect.any(Date), "user-1");
  });

  it("answers 502 with the partial manifest when the run failed", async () => {
    const failed = { ...result, manifest: { ...result.manifest, stopReason: "error" as const } };
    const { sink, responseSink, deps } = harness(failed);
    await compose(event({}), deps, responseSink);
    expect(sink.status).toBe(502);
  });

  it("streams one JSON line per event, ending with completed, when asked for NDJSON", async () => {
    const { sink, responseSink, deps, save } = harness();
    await compose(event({ headers: { accept: NDJSON } }), deps, responseSink);
    expect(sink).toMatchObject({ status: 200, contentType: NDJSON, ended: true });
    const lines = sink.chunks.map((chunk) => JSON.parse(chunk) as RunEvent);
    expect(lines.map((line) => line.type)).toEqual(["started", "completed"]);
    expect(sink.chunks.every((chunk) => chunk.endsWith("\n"))).toBe(true);
    expect(save).toHaveBeenCalled();
  });

  it("withholds the result with 503 when the audit record cannot be saved", async () => {
    const { sink, responseSink, deps, save } = harness();
    save.mockRejectedValueOnce(new Error("DynamoDB throttled"));
    await compose(event({}), deps, responseSink);
    expect(sink.status).toBe(503);
    expect(JSON.parse(sink.chunks.join(""))).toEqual({ error: expect.any(String) });
  });

  it("ends the stream with failed, not completed, when the audit record cannot be saved", async () => {
    const { sink, responseSink, deps, save } = harness();
    save.mockRejectedValueOnce(new Error("DynamoDB throttled"));
    await compose(event({ headers: { accept: NDJSON } }), deps, responseSink);
    const types = sink.chunks.map((chunk) => (JSON.parse(chunk) as RunEvent).type);
    expect(types).toEqual(["started", "failed"]);
  });
});
