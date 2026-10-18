import type { ClipDecision, ComposeResponse, Step } from "@clearframe/contracts";
import { describe, expect, it } from "vitest";
import { applyEvent, binClips, finishedRun, startRun } from "./live-run";
import { rulerTicks, stepKind, stepLabel, timelineBlocks } from "./timeline-model";

const request = { prompt: "5 nature clips in English", territory: "ES", date: "2026-10-18" };

const decision = (clipId: string, outcome: ClipDecision["outcome"]): ClipDecision => ({
  clipId,
  title: `Title ${clipId}`,
  genre: "nature_wildlife",
  language: "en",
  durationSec: 30,
  outcome,
  reasons: outcome === "refused" ? ["LICENSE_EXPIRED"] : [],
});

const step = (stepNumber: number, toolCalls: string[], durationMs = 1000): Step => ({
  stepNumber,
  toolCalls,
  inputTokens: 1000 * (stepNumber + 1),
  outputTokens: 100,
  durationMs,
});

const result: ComposeResponse = {
  manifest: {
    runId: "11111111-1111-4111-8111-111111111111",
    request,
    catalogVersion: "0".repeat(64),
    clips: [
      {
        clipId: "clip_0001",
        title: "Title clip_0001",
        genre: "nature_wildlife",
        language: "en",
        durationSec: 30,
        reason: "Fits",
        license: { trainingAllowed: true, territories: ["ES"], expiresAt: "2026-11-01" },
        daysUntilExpiry: 14,
        expiresSoon: true,
      },
    ],
    rejected: [{ clipId: "clip_0002", reasons: ["LICENSE_EXPIRED"] }],
    stopReason: "completed",
    summary: "Added one clip.",
    usage: { steps: 2, inputTokens: 3000, outputTokens: 200, embeddingTokens: 5 },
    costUsd: 0.001,
    durationMs: 2000,
  },
  steps: [step(0, ["searchClips"]), step(1, ["addToManifest"])],
  decisions: [decision("clip_0001", "accepted"), decision("clip_0002", "refused")],
};

describe("applyEvent", () => {
  it("follows what the agent is doing, step by step", () => {
    let run = startRun(request, 0);
    run = applyEvent(run, {
      type: "searching",
      query: "wolves in snow",
      filters: { language: "en" },
    });
    expect(run.activity).toEqual({
      kind: "searching",
      query: "wolves in snow",
      filters: { language: "en" },
    });
    run = applyEvent(run, { type: "step", step: step(0, ["searchClips"]) });
    expect(run.steps).toHaveLength(1);
    expect(run.activity).toEqual({ kind: "thinking" });
  });

  it("keeps clips in the order the agent first touched them, with their latest outcome", () => {
    let run = startRun(request, 0);
    run = applyEvent(run, {
      type: "clips",
      decisions: [decision("clip_0001", "checked"), decision("clip_0002", "checked")],
    });
    run = applyEvent(run, { type: "clips", decisions: [decision("clip_0001", "accepted")] });
    expect(run.decisions.map((d) => [d.clipId, d.outcome])).toEqual([
      ["clip_0001", "accepted"],
      ["clip_0002", "checked"],
    ]);
  });

  it("takes the final decisions and steps from the completed result", () => {
    const run = applyEvent(startRun(request, 0), { type: "completed", result });
    expect(run).toMatchObject({ status: "completed", activity: null, result });
    expect(run.decisions).toEqual(result.decisions);
  });

  it("ends as failed, with the server's message, when the run was not recorded", () => {
    const run = applyEvent(startRun(request, 0), { type: "failed", error: "Not recorded" });
    expect(run).toMatchObject({ status: "failed", error: "Not recorded", activity: null });
  });
});

describe("binClips", () => {
  it("attaches the manifest entry, with its license, to accepted clips", () => {
    const clips = binClips(finishedRun(result, 0));
    expect(clips[0]?.entry?.license.territories).toEqual(["ES"]);
    expect(clips[1]?.entry).toBeNull();
  });
});

describe("timeline", () => {
  it("names a step by its most consequential tool", () => {
    expect(stepKind(step(0, ["searchClips", "addToManifest"]))).toBe("propose");
    expect(stepKind(step(0, []))).toBe("answer");
    expect(stepLabel(step(0, ["searchClips", "searchClips", "addToManifest"]))).toBe(
      "Search ×2, Proposal",
    );
  });

  it("lays steps end to end and grows an open block up to the playhead", () => {
    const blocks = timelineBlocks([step(0, ["searchClips"], 1500)], { kind: "thinking" }, 4000);
    expect(blocks.map((b) => [b.kind, b.startMs, b.durationMs])).toEqual([
      ["search", 0, 1500],
      ["thinking", 1500, 2500],
    ]);
  });

  it("marks the ruler at most ten times", () => {
    expect(rulerTicks(8500)).toEqual([0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000]);
    expect(rulerTicks(10_000)).not.toContain(10_000);
    expect(rulerTicks(31_000)).toEqual([0, 5000, 10_000, 15_000, 20_000, 25_000, 30_000]);
  });
});
