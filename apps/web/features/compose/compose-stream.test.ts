import type { ComposeResponse, RunEvent } from "@clearframe/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { composeLive, ndjsonLines } from "./compose-stream";

const streamOf = (chunks: string[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
      controller.close();
    },
  });

async function collect(lines: AsyncGenerator<string>) {
  const out: string[] = [];
  for await (const line of lines) out.push(line);
  return out;
}

const result: ComposeResponse = {
  manifest: {
    runId: "11111111-1111-4111-8111-111111111111",
    request: { prompt: "surf", territory: "ES", date: "2026-10-18" },
    catalogVersion: "0".repeat(64),
    clips: [],
    rejected: [],
    stopReason: "completed",
    summary: "done",
    usage: { steps: 1, inputTokens: 10, outputTokens: 1, embeddingTokens: 0 },
    costUsd: 0.000001,
    durationMs: 5,
  },
  steps: [{ stepNumber: 0, toolCalls: [], inputTokens: 10, outputTokens: 1, durationMs: 5 }],
  decisions: [],
};

const started: RunEvent = {
  type: "started",
  runId: result.manifest.runId,
  request: result.manifest.request,
};

function respondWith(response: Response) {
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) => response);
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

const ndjson = (events: RunEvent[]) =>
  new Response(streamOf(events.map((event) => `${JSON.stringify(event)}\n`)), {
    headers: { "content-type": "application/x-ndjson" },
  });

const input = { prompt: "surf", territory: "ES", date: "2026-10-18" };

afterEach(() => vi.unstubAllGlobals());

describe("ndjsonLines", () => {
  it("joins lines and characters split across chunks, and keeps a last line without a newline", async () => {
    const bytes = new TextEncoder().encode('{"a":"café"}\n\n{"b":2}');
    const split = bytes.indexOf(0xc3) + 1;
    const chunks = [bytes.slice(0, split), bytes.slice(split)];
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    });
    expect(await collect(ndjsonLines(stream))).toEqual(['{"a":"café"}', '{"b":2}']);
  });
});

describe("composeLive", () => {
  it("asks for a stream, hands over every event and resolves with the recorded result", async () => {
    const fetch = respondWith(ndjson([started, { type: "completed", result }]));
    const events: RunEvent[] = [];
    await expect(composeLive("token", input, (event) => events.push(event))).resolves.toEqual(
      result,
    );
    expect(events.map((event) => event.type)).toEqual(["started", "completed"]);
    const init = fetch.mock.calls[0]![1]!;
    expect(init.headers).toMatchObject({
      accept: "application/x-ndjson",
      "x-clearframe-access-token": "token",
      "x-amz-content-sha256": expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it("rejects when the run could not be recorded, though events arrived", async () => {
    respondWith(ndjson([started, { type: "failed", error: "Not recorded" }]));
    await expect(composeLive("token", input, () => {})).rejects.toThrow("Not recorded");
  });

  it("rejects when the stream ends without a result", async () => {
    respondWith(ndjson([started]));
    await expect(composeLive("token", input, () => {})).rejects.toThrow("closed before");
  });

  it("skips an event type it does not know, so a newer API does not fail an older page", async () => {
    respondWith(
      new Response(
        streamOf([
          `${JSON.stringify(started)}\n`,
          '{"type":"cost_update","usd":0.001}\n',
          `${JSON.stringify({ type: "completed", result })}\n`,
        ]),
        { headers: { "content-type": "application/x-ndjson" } },
      ),
    );
    const types: string[] = [];
    await expect(composeLive("token", input, (event) => types.push(event.type))).resolves.toEqual(
      result,
    );
    expect(types).toEqual(["started", "completed"]);
  });

  it("rejects a known event that breaks the contract instead of skipping it", async () => {
    respondWith(
      new Response(streamOf(['{"type":"started","runId":"not-a-uuid"}\n']), {
        headers: { "content-type": "application/x-ndjson" },
      }),
    );
    await expect(composeLive("token", input, () => {})).rejects.toThrow("does not understand");
  });

  it("passes on the API's own message when it refuses the run", async () => {
    respondWith(Response.json({ error: "Daily run limit reached." }, { status: 429 }));
    await expect(composeLive("token", input, () => {})).rejects.toMatchObject({
      message: "Daily run limit reached.",
      status: 429,
    });
  });

  it("asks the user to sign in again on 401", async () => {
    respondWith(new Response(null, { status: 401 }));
    await expect(composeLive("token", input, () => {})).rejects.toThrow("Sign in again");
  });
});
