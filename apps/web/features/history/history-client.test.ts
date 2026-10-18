import type { RunSummary } from "@clearframe/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchRun, fetchRuns } from "./history-client";

const summary: RunSummary = {
  runId: "11111111-1111-4111-8111-111111111111",
  createdAt: "2026-10-18T10:00:00.000Z",
  prompt: "surf",
  territory: "ES",
  date: "2026-10-18",
  stopReason: "completed",
  clipCount: 1,
  rejectedCount: 0,
  costUsd: 0.001,
};

function respondWith(response: Response) {
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) => response);
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => vi.unstubAllGlobals());

describe("history client", () => {
  it("lists runs with the user's token", async () => {
    const fetch = respondWith(Response.json({ runs: [summary] }));
    await expect(fetchRuns("token")).resolves.toEqual([summary]);
    expect(fetch.mock.calls[0]![0]).toBe("/api/runs");
    expect(fetch.mock.calls[0]![1]?.headers).toEqual({ "x-clearframe-access-token": "token" });
  });

  it("refuses an answer outside the contract", async () => {
    respondWith(Response.json({ runs: [{ runId: "x" }] }));
    await expect(fetchRuns("token")).rejects.toThrow("does not understand");
  });

  it("passes on the API's message for a run it cannot show", async () => {
    respondWith(Response.json({ error: "No run with this id" }, { status: 404 }));
    await expect(fetchRun("token", summary.runId)).rejects.toMatchObject({
      message: "No run with this id",
      status: 404,
    });
  });
});
