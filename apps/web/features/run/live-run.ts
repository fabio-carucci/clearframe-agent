import type {
  ClipDecision,
  ComposeResponse,
  Manifest,
  ManifestEntry,
  RunEvent,
  Step,
} from "@clearframe/contracts";

type SearchEvent = Extract<RunEvent, { type: "searching" }>;

/** What the agent is doing between two steps: the open block at the end of the timeline. */
export type Activity =
  | { kind: "thinking" }
  | { kind: "searching"; query: string; filters: SearchEvent["filters"] }
  | { kind: "checking"; clipCount: number }
  | { kind: "proposing"; clipCount: number };

export interface LiveRun {
  status: "running" | "completed" | "failed";
  request: Manifest["request"];
  /** Date.now() when the run started, for the run-time readout and the playhead. */
  startedAt: number;
  runId: string | null;
  activity: Activity | null;
  /** Every clip the agent touched, in the order it first touched them, with its latest outcome. */
  decisions: ClipDecision[];
  steps: Step[];
  result: ComposeResponse | null;
  error: string | null;
}

export const startRun = (request: Manifest["request"], startedAt: number): LiveRun => ({
  status: "running",
  request,
  startedAt,
  runId: null,
  activity: { kind: "thinking" },
  decisions: [],
  steps: [],
  result: null,
  error: null,
});

/** A run that already happened, shown as it ended. */
export const finishedRun = (result: ComposeResponse, startedAt: number): LiveRun => ({
  ...startRun(result.manifest.request, startedAt),
  status: "completed",
  runId: result.manifest.runId,
  activity: null,
  decisions: result.decisions,
  steps: result.steps,
  result,
});

function mergeDecisions(current: ClipDecision[], updates: ClipDecision[]): ClipDecision[] {
  const byId = new Map(current.map((decision) => [decision.clipId, decision]));
  for (const update of updates) byId.set(update.clipId, update);
  return [...byId.values()];
}

export function applyEvent(run: LiveRun, event: RunEvent): LiveRun {
  switch (event.type) {
    case "started":
      return { ...run, runId: event.runId, request: event.request };
    case "searching":
      return {
        ...run,
        activity: { kind: "searching", query: event.query, filters: event.filters },
      };
    case "checking_rights":
      return { ...run, activity: { kind: "checking", clipCount: event.clipIds.length } };
    case "proposing":
      return { ...run, activity: { kind: "proposing", clipCount: event.clipIds.length } };
    case "clips":
      return { ...run, decisions: mergeDecisions(run.decisions, event.decisions) };
    case "step":
      return { ...run, steps: [...run.steps, event.step], activity: { kind: "thinking" } };
    case "completed":
      return {
        ...run,
        status: "completed",
        activity: null,
        decisions: mergeDecisions(run.decisions, event.result.decisions),
        steps: event.result.steps,
        result: event.result,
      };
    case "failed":
      return failRun(run, event.error);
  }
}

export const failRun = (run: LiveRun, error: string): LiveRun => ({
  ...run,
  status: "failed",
  activity: null,
  error,
});

/**
 * Whether a decision is on record. The rule's verdicts stream in before the run is recorded, and
 * only a recorded run issues a manifest: until then an accepted clip is not cleared.
 */
export type Standing = "final" | "recording" | "unrecorded";

/** A clip in the bin: the rule's decision, plus the manifest entry once the run is recorded. */
export interface BinClip extends ClipDecision {
  standing: Standing;
  entry: ManifestEntry | null;
}

export function binClips(run: LiveRun): BinClip[] {
  const entries = new Map(run.result?.manifest.clips.map((entry) => [entry.clipId, entry]));
  const standing: Standing = run.result
    ? "final"
    : run.status === "failed"
      ? "unrecorded"
      : "recording";
  return run.decisions.map((decision) => ({
    ...decision,
    standing,
    entry: entries.get(decision.clipId) ?? null,
  }));
}
