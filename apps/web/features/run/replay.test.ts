import type { ComposeResponse, RunEvent, Step } from "@clearframe/contracts";
import { describe, expect, it, vi } from "vitest";
import { replay, scheduleReplay } from "./replay";

const step = (stepNumber: number, durationMs: number): Step => ({
  stepNumber,
  toolCalls: ["searchClips"],
  inputTokens: 100,
  outputTokens: 10,
  durationMs,
});

const request = { prompt: "surf", territory: "ES", date: "2026-10-18" };
const result = { manifest: { request }, steps: [], decisions: [] } as unknown as ComposeResponse;

const events: RunEvent[] = [
  { type: "started", runId: "11111111-1111-4111-8111-111111111111", request },
  { type: "searching", query: "surf", filters: {} },
  { type: "step", step: step(0, 1000) },
  { type: "proposing", clipIds: ["clip_0001"] },
  { type: "clips", decisions: [] },
  { type: "step", step: step(1, 2000) },
  { type: "completed", result },
];

describe("scheduleReplay", () => {
  it("closes each step at the sum of the step durations so far", () => {
    const steps = scheduleReplay(events).filter(({ event }) => event.type === "step");
    expect(steps.map(({ atMs }) => atMs)).toEqual([1000, 3000]);
  });

  it("places tool events late in their own step, in order", () => {
    const times = Object.fromEntries(
      scheduleReplay(events).map(({ atMs, event }) => [event.type, atMs]),
    );
    expect(times.started).toBe(0);
    expect(times.searching).toBeGreaterThan(600);
    expect(times.searching).toBeLessThan(1000);
    expect(times.proposing).toBeGreaterThan(1000 + 1200);
    expect(times.proposing).toBeLessThan(times.clips!);
    expect(times.completed).toBeGreaterThan(3000);
  });
});

describe("replay", () => {
  it("emits every event and resolves with the recorded result", async () => {
    vi.useFakeTimers();
    const seen: string[] = [];
    const done = replay(events, (event) => seen.push(event.type));
    await vi.runAllTimersAsync();
    await expect(done).resolves.toBe(result);
    expect(seen).toEqual(events.map((event) => event.type));
    vi.useRealTimers();
  });

  it("refuses a recording that never completed", async () => {
    await expect(replay(events.slice(0, 3), () => {})).rejects.toThrow("completed");
  });
});
