import { describe, expect, it } from "vitest";
import type { Manifest } from "@clearframe/contracts";
import { toManifestEntry } from "@clearframe/core/agent/manifest";
import type { Clip } from "@clearframe/core/catalog/schema";
import type { EvalCase } from "./cases";
import {
  type EvalSummary,
  eligibleClipIds,
  filterPrecision,
  gateFailures,
  recall,
  rightsViolations,
  summarize,
  summaryLanguage,
} from "./metrics";

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

const usage = { territory: "ES", date: "2026-10-17" };

const manifestWith = (clipIds: string[]): Manifest => ({
  runId: "00000000-0000-4000-8000-000000000000",
  request: { prompt: "p", ...usage },
  catalogVersion: "0".repeat(64),
  clips: clipIds.map((clipId) => toManifestEntry(clipsById.get(clipId)!, usage, "r")),
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
  language: "en",
  territory: "ES",
  date: "2026-10-17",
  expected: { filters: { language: "es", maxDurationSec: 30 } },
  tags: ["baseline"],
};

describe("eligibleClipIds", () => {
  it("keeps clips that meet the filters and pass the rights rule", () => {
    expect([...eligibleClipIds(evalCase, catalog)]).toEqual(["clip_0001"]);
  });

  it("uses the handwritten set when the case has one", () => {
    const handwritten = { ...evalCase, expected: { ...evalCase.expected, clipIds: ["clip_0004"] } };
    expect([...eligibleClipIds(handwritten, catalog)]).toEqual(["clip_0004"]);
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
    clips: ids.map((clipId) => toManifestEntry(clip(clipId), usage, "r")),
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
      summaryLanguageOk: null,
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

describe("summaryLanguage", () => {
  it("reads the language of the agent's summary", () => {
    // The summary of the recorded sample run, written in Spanish for an English request.
    const spanish =
      "Resumen:\n- **clip_0060:** no lo añadí. Su licencia caducó el 2026-04-19, así que no está " +
      "permitido usarlo para entrenamiento en ES.\n- **Clips añadidos:** 8 de 8.\nEl manifiesto " +
      "tiene 8 clips, así que no hay déficit.";
    expect(summaryLanguage(spanish, [])).toBe("es");
    expect(
      summaryLanguage(
        "Ho aggiunto 5 clip di natura in inglese. Le altre non sono state aggiunte perché la " +
          "licenza è scaduta.",
        [],
      ),
    ).toBe("it");
    expect(
      summaryLanguage(
        "Added 8 of the 8 clips requested. clip_0060 was not added: its license expired.",
        [],
      ),
    ).toBe("en");
  });

  it("ignores the English clip titles a summary quotes", () => {
    const titles = ["The chef and the market of Valencia", "Paella for the family"];
    const italian =
      "Aggiunte 2 clip: The chef and the market of Valencia, Paella for the family. Nessuna è stata " +
      "rifiutata.";
    expect(summaryLanguage(italian, titles)).toBe("it");
  });

  it("returns null when no language leads", () => {
    expect(summaryLanguage("clip_0001, clip_0002: 2 clips.", [])).toBeNull();
  });
});

describe("gateFailures", () => {
  const passing = {
    ...summarize([]),
    violations: 0,
    errors: 0,
    meanRecall: 0.9,
    meanFilterPrecision: 0.95,
  } satisfies EvalSummary;

  it("passes at the thresholds", () => {
    expect(gateFailures(passing, { minRecall: 0.9, minFilterPrecision: 0.95 })).toEqual([]);
  });

  it("fails when a mean falls below its threshold", () => {
    const failures = gateFailures(
      { ...passing, meanRecall: 0.4 },
      { minRecall: 0.9, minFilterPrecision: 0.95 },
    );
    expect(failures).toEqual(["mean recall 0.400 is below 0.9"]);
  });

  it("fails on any rights violation or error, whatever the thresholds", () => {
    expect(gateFailures({ ...passing, violations: 1, errors: 2 }, {})).toHaveLength(2);
  });

  it("skips a threshold when no case produced the metric", () => {
    expect(gateFailures({ ...passing, meanRecall: null }, { minRecall: 0.9 })).toEqual([]);
  });
});
