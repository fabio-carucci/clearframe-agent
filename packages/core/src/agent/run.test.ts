import type { RunEvent } from "@clearframe/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Clip } from "../catalog/schema";
import type { EmbeddingIndex } from "../retrieval/embeddings";
import { TOKEN_BUDGET, createClipAgent } from "./agent";
import type { RunContext } from "./context";
import { runClipAgent, stopReasonOf } from "./run";

vi.mock("./agent", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./agent")>()),
  createClipAgent: vi.fn(),
}));

describe("stopReasonOf", () => {
  it("is completed when the model ended with a text answer", () => {
    expect(stopReasonOf("stop", TOKEN_BUDGET * 2)).toBe("completed");
  });

  it("blames the token budget when the loop stopped mid tool call over budget", () => {
    expect(stopReasonOf("tool-calls", TOKEN_BUDGET)).toBe("token_budget");
  });

  it("blames the step limit when the loop stopped mid tool call under budget", () => {
    expect(stopReasonOf("tool-calls", TOKEN_BUDGET - 1)).toBe("step_limit");
  });
});

const clip: Clip = {
  id: "clip_0001",
  title: "Surf",
  description: "Surf",
  genre: "sports_outdoor",
  language: "es",
  durationSec: 20,
  resolution: "1080p",
  license: { trainingAllowed: true, territories: ["ES"], expiresAt: null },
};

const deps = {
  data: { clips: [clip], clipsById: new Map([[clip.id, clip]]), index: {} as EmbeddingIndex },
  embedQuery: async () => ({ embedding: [], tokens: 0 }),
};

type FakeGenerate = (options: {
  onStepEnd: (event: { stepNumber: number; usage: object; toolCalls: object[] }) => void;
}) => Promise<unknown>;

function fakeAgent(generate: (run: RunContext) => FakeGenerate) {
  vi.mocked(createClipAgent).mockImplementation(
    (run) => ({ generate: generate(run) }) as unknown as ReturnType<typeof createClipAgent>,
  );
}

describe("runClipAgent", () => {
  beforeEach(() => vi.mocked(createClipAgent).mockReset());

  it("keeps the clips accepted before a mid-run failure and reports why", async () => {
    fakeAgent((run) => async ({ onStepEnd }) => {
      run.draft.propose("clip_0001", "fits");
      onStepEnd({
        stepNumber: 0,
        usage: { inputTokens: 100, outputTokens: 10 },
        toolCalls: [{ toolName: "addToManifest" }],
      });
      throw new Error("provider overloaded");
    });

    const { manifest, steps, error } = await runClipAgent(
      { prompt: "surf", territory: "ES", date: "2026-10-17" },
      deps,
    );

    expect(error).toEqual({ code: "internal_error", message: "Error: provider overloaded" });
    expect(manifest.summary).not.toContain("provider overloaded");
    expect(manifest.stopReason).toBe("error");
    expect(manifest.clips.map((entry) => entry.clipId)).toEqual(["clip_0001"]);
    expect(manifest.usage).toMatchObject({ steps: 1, inputTokens: 100, outputTokens: 10 });
    expect(steps).toEqual([expect.objectContaining({ toolCalls: ["addToManifest"] })]);
  });

  it("uses the run id it is given, so callers can find the trace", async () => {
    fakeAgent(() => async () => ({ finishReason: "stop", text: "done" }));
    const runId = "11111111-1111-4111-8111-111111111111";
    const { manifest } = await runClipAgent(
      { prompt: "surf", territory: "ES", date: "2026-10-17" },
      { ...deps, runId },
    );
    expect(manifest).toMatchObject({ runId, stopReason: "completed", summary: "done" });
  });

  it("rejects an invalid request before calling the model", async () => {
    await expect(
      runClipAgent({ prompt: "surf", territory: "Spain", date: "2026-10-17" }, deps),
    ).rejects.toThrow();
    expect(createClipAgent).not.toHaveBeenCalled();
  });

  it("streams started, each step and completed, and returns the final clip decisions", async () => {
    fakeAgent((run) => async ({ onStepEnd }) => {
      run.decisions.record("clip_0001", "checked", []);
      onStepEnd({
        stepNumber: 0,
        usage: { inputTokens: 50, outputTokens: 5 },
        toolCalls: [{ toolName: "getRights" }],
      });
      return { finishReason: "stop", text: "done" };
    });
    const events: RunEvent[] = [];

    const { decisions } = await runClipAgent(
      { prompt: "surf", territory: "ES", date: "2026-10-17" },
      { ...deps, onEvent: (event) => events.push(event) },
    );

    expect(events.map((event) => event.type)).toEqual(["started", "step", "completed"]);
    expect(decisions).toEqual([
      expect.objectContaining({ clipId: "clip_0001", outcome: "not_proposed" }),
    ]);
    expect(events.at(-1)).toMatchObject({ type: "completed", result: { decisions } });
  });

  it("finishes the run even when the event listener throws", async () => {
    fakeAgent(() => async () => ({ finishReason: "stop", text: "done" }));
    const { manifest } = await runClipAgent(
      { prompt: "surf", territory: "ES", date: "2026-10-17" },
      {
        ...deps,
        onEvent: () => {
          throw new Error("client went away");
        },
      },
    );
    expect(manifest.stopReason).toBe("completed");
  });
});
