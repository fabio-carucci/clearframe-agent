import type { Manifest, StopReason } from "../src/agent/manifest";
import type { Clip } from "../src/catalog/schema";
import { type SearchFilters, matchesFilters } from "../src/retrieval/search";
import { checkTrainingRights } from "../src/rights/check-training-rights";
import type { EvalCase } from "./cases";

/** Clips a perfect agent could return for the case: they meet every constraint and pass the rule. */
export function eligibleClipIds(evalCase: EvalCase, catalog: readonly Clip[]): Set<string> {
  const usage = { territory: evalCase.territory, date: evalCase.date };
  return new Set(
    catalog
      .filter(
        (clip) =>
          (evalCase.expected.candidateIds?.includes(clip.id) ?? true) &&
          matchesFilters(clip, evalCase.expected.filters) &&
          checkTrainingRights(clip.license, usage).allowed,
      )
      .map((clip) => clip.id),
  );
}

/** Manifest clips whose license fails the rule for the request. Must be zero. */
export function rightsViolations(
  manifest: Manifest,
  clipsById: ReadonlyMap<string, Clip>,
): string[] {
  const usage = { territory: manifest.request.territory, date: manifest.request.date };
  return manifest.clips
    .filter((entry) => {
      const clip = clipsById.get(entry.clipId);
      return !clip || !checkTrainingRights(clip.license, usage).allowed;
    })
    .map((entry) => entry.clipId);
}

/**
 * Share of manifest clips that meet the case's expected filters, read from the catalog.
 * Null for an empty manifest: there is nothing to be precise about.
 */
export function filterPrecision(
  manifest: Manifest,
  expectedFilters: SearchFilters,
  clipsById: ReadonlyMap<string, Clip>,
): number | null {
  if (manifest.clips.length === 0) return null;
  const matching = manifest.clips.filter((entry) => {
    const clip = clipsById.get(entry.clipId);
    return clip && matchesFilters(clip, expectedFilters);
  });
  return matching.length / manifest.clips.length;
}

/**
 * Share of the clips the agent could have returned that it did return, capped at the requested
 * count. Null when nothing was eligible.
 */
export function recall(
  manifest: Manifest,
  eligible: ReadonlySet<string>,
  maxClips?: number,
): number | null {
  const reachable = Math.min(eligible.size, maxClips ?? Infinity);
  if (reachable === 0) return null;
  const found = manifest.clips.filter((entry) => eligible.has(entry.clipId)).length;
  return Math.min(found, reachable) / reachable;
}

export interface CaseResult {
  caseId: string;
  tags: readonly string[];
  eligible: number;
  clips: number;
  violations: string[];
  filterPrecision: number | null;
  recall: number | null;
  countRespected: boolean;
  stopReason: StopReason | "error";
  steps: number;
  costUsd: number;
  durationMs: number;
  error?: string;
}

export function scoreCase(
  evalCase: EvalCase,
  manifest: Manifest,
  catalog: readonly Clip[],
  clipsById: ReadonlyMap<string, Clip>,
): CaseResult {
  const eligible = eligibleClipIds(evalCase, catalog);
  return {
    caseId: evalCase.id,
    tags: evalCase.tags,
    eligible: eligible.size,
    clips: manifest.clips.length,
    violations: rightsViolations(manifest, clipsById),
    filterPrecision: filterPrecision(manifest, evalCase.expected.filters, clipsById),
    recall: recall(manifest, eligible, evalCase.expected.maxClips),
    countRespected: manifest.clips.length <= (evalCase.expected.maxClips ?? Infinity),
    stopReason: manifest.stopReason,
    steps: manifest.usage.steps,
    costUsd: manifest.costUsd,
    durationMs: manifest.durationMs,
  };
}

const mean = (values: number[]) =>
  values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;

const percentile = (values: number[], p: number) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
};

export function summarize(results: readonly CaseResult[]) {
  const scored = results.filter((r) => r.stopReason !== "error");
  const stopReasons: Record<string, number> = {};
  for (const r of results) stopReasons[r.stopReason] = (stopReasons[r.stopReason] ?? 0) + 1;

  return {
    runs: results.length,
    errors: results.length - scored.length,
    violations: scored.reduce((sum, r) => sum + r.violations.length, 0),
    meanFilterPrecision: mean(scored.flatMap((r) => r.filterPrecision ?? [])),
    meanRecall: mean(scored.flatMap((r) => r.recall ?? [])),
    countRespectedRate: mean(scored.map((r) => (r.countRespected ? 1 : 0))),
    meanCostUsd: mean(scored.map((r) => r.costUsd)),
    totalCostUsd: scored.reduce((sum, r) => sum + r.costUsd, 0),
    meanSteps: mean(scored.map((r) => r.steps)),
    p50DurationMs: percentile(
      scored.map((r) => r.durationMs),
      50,
    ),
    p95DurationMs: percentile(
      scored.map((r) => r.durationMs),
      95,
    ),
    stopReasons,
  };
}

export type EvalSummary = ReturnType<typeof summarize>;
