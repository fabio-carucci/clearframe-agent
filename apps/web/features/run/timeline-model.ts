import type { Step } from "@clearframe/contracts";
import type { Activity } from "./live-run";

/** The colour family of a timeline block, by what the agent did in that step. */
export type BlockKind = "search" | "rights" | "propose" | "answer" | "thinking";

export interface TimelineBlock {
  key: string;
  kind: BlockKind;
  startMs: number;
  durationMs: number;
  label: string;
  /** The finished step, or null for the block still growing at the playhead. */
  step: Step | null;
}

const TOOL_KINDS: Record<string, BlockKind> = {
  searchClips: "search",
  getRights: "rights",
  addToManifest: "propose",
};

const KIND_LABELS: Record<BlockKind, string> = {
  search: "Search",
  rights: "Rights check",
  propose: "Proposal",
  answer: "Answer",
  thinking: "Thinking",
};

export const kindLabel = (kind: BlockKind) => KIND_LABELS[kind];

/** A step that proposed clips matters most, then one that checked rights, then a search. */
export function stepKind(step: Step): BlockKind {
  const kinds = new Set(step.toolCalls.map((tool) => TOOL_KINDS[tool]));
  for (const kind of ["propose", "rights", "search"] as const) if (kinds.has(kind)) return kind;
  return "answer";
}

export function stepLabel(step: Step): string {
  if (step.toolCalls.length === 0) return KIND_LABELS.answer;
  const counts = new Map<string, number>();
  for (const tool of step.toolCalls) {
    const label = KIND_LABELS[TOOL_KINDS[tool] ?? "answer"];
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts].map(([label, n]) => (n > 1 ? `${label} ×${n}` : label)).join(", ");
}

export function activityBlock(activity: Activity): Pick<TimelineBlock, "kind" | "label"> {
  switch (activity.kind) {
    case "thinking":
      return { kind: "thinking", label: "Thinking" };
    case "searching":
      return { kind: "search", label: `Search: ${activity.query}` };
    case "checking":
      return { kind: "rights", label: `Checking ${activity.clipCount} licenses` };
    case "proposing":
      return { kind: "propose", label: `Proposing ${activity.clipCount} clips` };
  }
}

/**
 * Steps laid end to end, as the server timed them. While a run is live, the time since the last
 * step becomes an open block labelled with what the agent is doing, ending at the playhead.
 */
export function timelineBlocks(
  steps: Step[],
  activity: Activity | null,
  elapsedMs: number,
): TimelineBlock[] {
  let startMs = 0;
  const blocks: TimelineBlock[] = steps.map((step) => {
    const block: TimelineBlock = {
      key: `step-${step.stepNumber}`,
      kind: stepKind(step),
      startMs,
      durationMs: step.durationMs,
      label: stepLabel(step),
      step,
    };
    startMs += step.durationMs;
    return block;
  });
  if (activity && elapsedMs > startMs) {
    blocks.push({
      key: "open",
      ...activityBlock(activity),
      startMs,
      durationMs: elapsedMs - startMs,
      step: null,
    });
  }
  return blocks;
}

const TICK_INTERVALS_MS = [1_000, 2_000, 5_000, 10_000, 15_000, 30_000, 60_000];

/**
 * Ruler marks every whole interval, choosing the interval that gives at most ten marks. None sits
 * on the right edge, where its label would be cut off.
 */
export function rulerTicks(spanMs: number): number[] {
  const interval =
    TICK_INTERVALS_MS.find((candidate) => spanMs / candidate <= 10) ?? TICK_INTERVALS_MS.at(-1)!;
  const ticks: number[] = [];
  for (let at = 0; at < spanMs; at += interval) ticks.push(at);
  return ticks;
}
