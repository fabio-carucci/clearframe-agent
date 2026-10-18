"use client";

import type { ComposeResponse, Manifest, RunEvent } from "@clearframe/contracts";
import { useCallback, useEffect, useReducer, useState } from "react";
import { type LiveRun, applyEvent, failRun, finishedRun, startRun } from "./live-run";

type Action =
  | { type: "start"; request: Manifest["request"]; at: number }
  | { type: "event"; event: RunEvent }
  | { type: "fail"; message: string };

function reduce(run: LiveRun | null, action: Action): LiveRun | null {
  if (action.type === "start") return startRun(action.request, action.at);
  if (!run) return run;
  return action.type === "event" ? applyEvent(run, action.event) : failRun(run, action.message);
}

/** Runs a dataset composition and tracks its events; `execute` streams them from any source. */
export function useLiveRun(recorded?: ComposeResponse) {
  const [run, dispatch] = useReducer(reduce, recorded ? finishedRun(recorded, 0) : null);

  const start = useCallback(
    async (
      request: Manifest["request"],
      execute: (onEvent: (event: RunEvent) => void) => Promise<unknown>,
    ) => {
      dispatch({ type: "start", request, at: Date.now() });
      try {
        await execute((event) => dispatch({ type: "event", event }));
      } catch (error) {
        dispatch({ type: "fail", message: error instanceof Error ? error.message : String(error) });
      }
    },
    [],
  );

  return { run, start };
}

/**
 * Milliseconds since the run started, ticking while it runs; the server's figure once it ends.
 * Never less than the steps already finished, since animation frames pause in background tabs.
 */
export function useElapsed(run: LiveRun | null): number {
  const running = run?.status === "running";
  const startedAt = run?.startedAt ?? 0;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running) return;
    let frame = requestAnimationFrame(function tick() {
      setNow(Date.now());
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [running]);

  if (!run) return 0;
  if (run.result) return run.result.manifest.durationMs;
  const finishedMs = run.steps.reduce((total, step) => total + step.durationMs, 0);
  return running ? Math.max(finishedMs, now - startedAt) : finishedMs;
}
