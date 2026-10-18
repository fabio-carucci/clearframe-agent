import type { Manifest, RunSummary } from "@clearframe/contracts";
import type { LambdaFunctionURLEvent } from "aws-lambda";
import { describe, expect, it, vi } from "vitest";
import { ACCESS_TOKEN_HEADER } from "./auth";
import type { ResponseSink } from "./compose";
import type { StoredRunRecord } from "./run-record";
import type { RunHistory } from "./run-store";
import { type ApiDeps, route } from "./router";

const runId = "11111111-1111-4111-8111-111111111111";

const manifest: Manifest = {
  runId,
  request: { prompt: "surf", territory: "ES", date: "2026-10-18" },
  catalogVersion: "0".repeat(64),
  clips: [
    {
      clipId: "clip_0001",
      title: "Surf",
      genre: "sports_outdoor",
      language: "es",
      durationSec: 20,
      reason: "Surfing in Spanish.",
      license: { trainingAllowed: true, territories: ["ES"], expiresAt: null },
      daysUntilExpiry: null,
      expiresSoon: false,
    },
  ],
  rejected: [{ clipId: "clip_0060", reasons: ["LICENSE_EXPIRED"] }],
  stopReason: "completed",
  summary: "One clip.",
  usage: { steps: 1, inputTokens: 10, outputTokens: 1, embeddingTokens: 0 },
  costUsd: 0.000001,
  durationMs: 5,
};

const record = {
  runId,
  userId: "user-1",
  createdAt: "2026-10-18T10:00:00.000Z",
  steps: [{ stepNumber: 0, toolCalls: [], inputTokens: 10, outputTokens: 1, durationMs: 5 }],
  manifestKey: `manifests/2026-10-18/${runId}.json`,
  manifestVersionId: "v1",
  manifestSha256: "abc=",
} as unknown as StoredRunRecord;

const summary: RunSummary = {
  runId,
  createdAt: record.createdAt,
  prompt: "surf",
  territory: "ES",
  date: "2026-10-18",
  stopReason: "completed",
  clipCount: 1,
  rejectedCount: 1,
  costUsd: 0.000001,
};

function call(
  path: string,
  overrides: { method?: string; token?: string; history?: Partial<RunHistory> } = {},
) {
  const sink = { status: 0, body: "" };
  const responseSink: ResponseSink = {
    start: (status) => void (sink.status = status),
    write: (chunk) => void (sink.body += chunk),
    end: async () => {},
  };
  const history: RunHistory = {
    listRuns: vi.fn(async () => [summary]),
    findRun: vi.fn(async () => record),
    readManifest: vi.fn(async () => ({ manifest, verified: true })),
    ...overrides.history,
  };
  const deps = {
    verifier: async () => ({
      verify: async (token: string) => {
        if (token !== "valid") throw new Error("bad");
        return { sub: "user-1" };
      },
    }),
    history,
  } as unknown as ApiDeps;
  const event = {
    rawPath: path,
    requestContext: { http: { method: overrides.method ?? "GET" } },
    headers: { [ACCESS_TOKEN_HEADER]: overrides.token ?? "valid" },
    isBase64Encoded: false,
  } as unknown as LambdaFunctionURLEvent;
  return route(event, deps, responseSink).then(() => ({
    status: sink.status,
    body: JSON.parse(sink.body) as Record<string, unknown>,
    history,
  }));
}

describe("GET /api/runs", () => {
  it("lists the caller's own runs, newest first", async () => {
    const { status, body, history } = await call("/api/runs");
    expect(status).toBe(200);
    expect(body).toEqual({ runs: [summary] });
    expect(history.listRuns).toHaveBeenCalledWith("user-1", 20);
  });

  it("refuses a caller without a valid token", async () => {
    expect((await call("/api/runs", { token: "forged" })).status).toBe(401);
  });
});

describe("GET /api/runs/:id", () => {
  it("returns the stored manifest, its audit ids, and decisions rebuilt from it", async () => {
    const { status, body } = await call(`/api/runs/${runId}`);
    expect(status).toBe(200);
    expect(body).toMatchObject({
      manifest,
      createdAt: record.createdAt,
      audit: { manifestVersionId: "v1", manifestSha256: "abc=", verified: true },
    });
    expect(body.decisions).toEqual([
      expect.objectContaining({ clipId: "clip_0001", outcome: "accepted" }),
      expect.objectContaining({
        clipId: "clip_0060",
        outcome: "refused",
        reasons: ["LICENSE_EXPIRED"],
      }),
    ]);
  });

  it("answers 404 for another user's run, exactly as for a missing one", async () => {
    const theirs = await call(`/api/runs/${runId}`, {
      history: { findRun: async () => ({ ...record, userId: "user-2" }) },
    });
    const missing = await call(`/api/runs/${runId}`, { history: { findRun: async () => null } });
    expect(theirs).toMatchObject({ status: 404, body: missing.body });
  });

  it("answers 422 for a run recorded in a manifest format it no longer reads", async () => {
    const { status } = await call(`/api/runs/${runId}`, {
      history: { readManifest: async () => null },
    });
    expect(status).toBe(422);
  });
});

describe("route", () => {
  it("answers 405 for a write to the runs routes and 404 elsewhere", async () => {
    expect((await call("/api/runs", { method: "POST" })).status).toBe(405);
    expect((await call("/api/runs/not-an-id")).status).toBe(404);
    expect((await call("/api/other")).status).toBe(404);
  });
});
