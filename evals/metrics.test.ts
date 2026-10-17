import { describe, expect, it } from "vitest";
import type { Manifest } from "../src/agent/manifest";
import type { Clip } from "../src/catalog/schema";
import type { EvalCase } from "./cases";
import { eligibleClipIds, filterPrecision, recall, rightsViolations, summarize } from "./metrics";

const clip = (id: string, overrides: Partial<Clip> = {}): Clip => ({
  id,
  title: id,
  description: id,
  genre: "cooking",
  language: "es",
  durationSec: 20,
  resolution: "1080p",
  license: { trainingAllowed: true, territories: ["ES"], expiresAt: null },
  ...overrides,
});

const catalog = [
  clip("clip_0001"),
  clip("clip_0002", { language: "en" }),
  clip("clip_0003", { durationSec: 50 }),
  clip("clip_0004", {
    license: { trainingAllowed: true, territories: ["ES"], expiresAt: "2026-01-01" },
  }),
];
const clipsById = new Map(catalog.map((c) => [c.id, c]));

const manifestWith = (clipIds: string[]): Manifest => ({
  runId: "00000000-0000-4000-8000-000000000000",
  request: { prompt: "p", territory: "ES", date: "2026-10-17" },
  clips: clipIds.map((clipId) => {
    const { title, genre, language, durationSec } = clipsById.get(clipId)!;
    return { clipId, title, genre, language, durationSec, reason: "r" };
  }),
  rejected: [],
  stopReason: "completed",
  summary: "",
  usage: { steps: 1, inputTokens: 0, outputTokens: 0, embeddingTokens: 0 },
  costUsd: 0,
  durationMs: 0,
});

const evalCase: EvalCase = {
  id: "case",
  prompt: "p",
  territory: "ES",
  date: "2026-10-17",
  expected: { filters: { language: "es", maxDurationSec: 30 } },
  tags: ["baseline"],
};

describe("eligibleClipIds", () => {
  it("keeps clips that meet the filters and pass the rights rule", () => {
    expect([...eligibleClipIds(evalCase, catalog)]).toEqual(["clip_0001"]);
  });
});

describe("rightsViolations", () => {
  it("lists manifest clips whose license fails for the request", () => {
    expect(rightsViolations(manifestWith(["clip_0001", "clip_0004"]), clipsById)).toEqual([
      "clip_0004",
    ]);
  });
});

describe("filterPrecision", () => {
  const filters = evalCase.expected.filters;

  it("is 1 when every clip meets the expected filters", () => {
    expect(filterPrecision(manifestWith(["clip_0001"]), filters, clipsById)).toBe(1);
  });

  it("is the share of clips that meet every expected filter", () => {
    expect(
      filterPrecision(
        manifestWith(["clip_0001", "clip_0002", "clip_0003", "clip_0004"]),
        filters,
        clipsById,
      ),
    ).toBe(0.5);
  });

  it("ignores licenses: rights are measured by rightsViolations, not here", () => {
    expect(filterPrecision(manifestWith(["clip_0004"]), filters, clipsById)).toBe(1);
  });

  it("is null for an empty manifest instead of 0 or 1", () => {
    expect(filterPrecision(manifestWith([]), filters, clipsById)).toBeNull();
  });
});

describe("recall", () => {
  const eligible = new Set(["a", "b", "c", "d"]);
  const found = (ids: string[]): Manifest => ({
    ...manifestWith([]),
    clips: ids.map((clipId) => ({
      clipId,
      title: "",
      genre: "cooking",
      language: "es",
      durationSec: 1,
      reason: "r",
    })),
  });

  it("is the share of eligible clips that were returned", () => {
    expect(recall(found(["a", "b"]), eligible)).toBe(0.5);
  });

  it("is capped by the requested count", () => {
    expect(recall(found(["a", "b"]), eligible, 2)).toBe(1);
  });

  it("is null when nothing was eligible", () => {
    expect(recall(found([]), new Set())).toBeNull();
  });
});

describe("summarize", () => {
  it("adds up violations and averages only the defined metrics", () => {
    const base = {
      tags: [],
      eligible: 1,
      clips: 1,
      countRespected: true,
      stopReason: "completed" as const,
      steps: 2,
      costUsd: 0.002,
      durationMs: 1000,
    };
    const summary = summarize([
      { ...base, caseId: "a", violations: [], filterPrecision: 1, recall: 1 },
      { ...base, caseId: "b", violations: ["clip_x"], filterPrecision: null, recall: 0.5 },
    ]);
    expect(summary.violations).toBe(1);
    expect(summary.meanFilterPrecision).toBe(1);
    expect(summary.meanRecall).toBe(0.75);
    expect(summary.totalCostUsd).toBeCloseTo(0.004);
  });
});
