"use client";

import type { ComposeResponse, Manifest, RunDetailResponse, RunEvent } from "@clearframe/contracts";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { type LiveRun, applyEvent, failRun, finishedRun, startRun } from "./live-run";

type Action =
  | { type: "show"; run: LiveRun }
  | { type: "start"; request: Manifest["request"]; at: number }
  | { type: "event"; event: RunEvent }
  | { type: "fail"; message: string };

function reduce(run: LiveRun | null, action: Action): LiveRun | null {
  if (action.type === "show") return action.run;
  if (action.type === "start") return startRun(action.request, action.at);
  if (!run) return run;
  return action.type === "event" ? applyEvent(run, action.event) : failRun(run, action.message);
}

type Execute = (onEvent: (event: RunEvent) => void, signal: AbortSignal) => Promise<unknown>;

/**
 * Runs a dataset composition and tracks its events; `execute` streams them from any source. A new
 * run, or leaving the page, aborts the one before, which then changes nothing: its failure must
 * not mark the new run failed.
 */
export function useLiveRun(recorded?: ComposeResponse) {
  const [run, dispatch] = useReducer(reduce, recorded ? finishedRun(recorded, 0) : null);
  const current = useRef<AbortController | null>(null);
  useEffect(() => () => current.current?.abort(), []);

  const start = useCallback(async (request: Manifest["request"], execute: Execute) => {
    current.current?.abort();
    const controller = new AbortController();
    current.current = controller;
    dispatch({ type: "start", request, at: Date.now() });
    try {
      await execute((event) => {
        if (!controller.signal.aborted) dispatch({ type: "event", event });
      }, controller.signal);
    } catch (error) {
      if (controller.signal.aborted) return;
      dispatch({ type: "fail", message: error instanceof Error ? error.message : String(error) });
    }
  }, []);

  /** Shows a recorded run from the history, abandoning any run in progress on this page. */
  const show = useCallback((detail: RunDetailResponse) => {
    current.current?.abort();
    dispatch({ type: "show", run: finishedRun(detail, 0, detail.audit) });
  }, []);

  return { run, start, show };
}

/** The run-time readout shows tenths of a second, so ten ticks a second are enough. */
const TICK_MS = 100;

/**
 * Milliseconds since the run started, ticking while it runs; the server's figure once it ends.
 * Never less than the steps already finished, since timers slow down in background tabs. Use it
 * only in the components that show time, so the rest of the page does not re-render each tick.
 */
export function useElapsed(run: LiveRun | null): number {
  const running = run?.status === "running";
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [running]);

  if (!run) return 0;
  if (run.result) return run.result.manifest.durationMs;
  const finishedMs = run.steps.reduce((total, step) => total + step.durationMs, 0);
  return running ? Math.max(finishedMs, now - run.startedAt) : finishedMs;
}
