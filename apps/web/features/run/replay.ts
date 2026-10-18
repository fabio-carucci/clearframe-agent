import type { ComposeResponse, RunEvent } from "@clearframe/contracts";

export interface ScheduledEvent {
  atMs: number;
  event: RunEvent;
}

/**
 * When each recorded event happened, rebuilt from step durations, since events carry no clock.
 * Within a step the model thinks first and its tools run last, so a step's tool events fall in
 * its last stretch and its step event closes it.
 */
export function scheduleReplay(events: RunEvent[]): ScheduledEvent[] {
  const scheduled: ScheduledEvent[] = [];
  let stepStartMs = 0;
  let pending: RunEvent[] = [];

  for (const event of events) {
    if (event.type === "started") {
      scheduled.push({ atMs: 0, event });
    } else if (event.type === "step") {
      const durationMs = event.step.durationMs;
      pending.forEach((toolEvent, index) => {
        const share = 0.6 + (0.35 * (index + 1)) / (pending.length + 1);
        scheduled.push({ atMs: Math.round(stepStartMs + durationMs * share), event: toolEvent });
      });
      stepStartMs += durationMs;
      scheduled.push({ atMs: stepStartMs, event });
      pending = [];
    } else {
      pending.push(event);
    }
  }
  pending.forEach((event, index) =>
    scheduled.push({ atMs: stepStartMs + 250 * (index + 1), event }),
  );
  return scheduled;
}

/** The result a recording ends with. */
export function recordedResult(events: RunEvent[]): ComposeResponse {
  const last = events.at(-1);
  if (last?.type !== "completed")
    throw new Error("The recording does not end with a completed run.");
  return last.result;
}

/** Plays a recorded run back at its original pace; resolves with its result like a live run. */
export function replay(
  events: RunEvent[],
  onEvent: (event: RunEvent) => void,
): Promise<ComposeResponse> {
  return new Promise((resolve, reject) => {
    let result: ComposeResponse;
    try {
      result = recordedResult(events);
    } catch (error) {
      reject(error);
      return;
    }
    for (const { atMs, event } of scheduleReplay(events)) {
      setTimeout(() => {
        onEvent(event);
        if (event.type === "completed") resolve(result);
      }, atMs);
    }
  });
}
