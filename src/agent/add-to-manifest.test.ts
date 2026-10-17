import { describe, expect, it } from "vitest";
import type { z } from "zod";
import type { Clip } from "../catalog/schema";
import type { EmbeddingIndex } from "../retrieval/embeddings";
import { createAddToManifestTool } from "./add-to-manifest";
import type { RunContext } from "./context";
import { ManifestDraft } from "./manifest";
import { MAX_BATCH } from "./tools";

const clip = (id: string, trainingAllowed = true): Clip => ({
  id,
  title: `Title ${id}`,
  description: "A clip.",
  genre: "sports_outdoor",
  language: "es",
  durationSec: 20,
  resolution: "1080p",
  license: { trainingAllowed, territories: ["ES"], expiresAt: null },
});

function setup() {
  const clips = [clip("clip_0001"), clip("clip_0002", false), clip("clip_0003")];
  const clipsById = new Map(clips.map((c) => [c.id, c]));
  const run: RunContext = {
    data: { clips, clipsById, index: {} as EmbeddingIndex },
    draft: new ManifestDraft(clipsById, { territory: "ES", date: "2026-10-01" }),
    embedQuery: async () => {
      throw new Error("addToManifest must not search");
    },
    stats: { embeddingTokens: 0 },
  };
  const addToManifest = createAddToManifestTool(run);
  const execute = addToManifest.execute as (input: unknown, options: unknown) => Promise<unknown>;
  const call = (input: unknown) => execute(input, { toolCallId: "call_1", messages: [] });
  const schema = addToManifest.inputSchema as z.ZodObject;
  return { run, call, schema };
}

describe("addToManifest tool", () => {
  it("adds eligible clips and reports the manifest size", async () => {
    const { run, call } = setup();
    await expect(
      call({ items: [{ clipId: "clip_0001", reason: "Spanish outdoor sport, 20 seconds" }] }),
    ).resolves.toEqual({
      outcomes: [{ clipId: "clip_0001", status: "accepted" }],
      manifestSize: 1,
    });
    expect(run.draft.entries.map((entry) => entry.clipId)).toEqual(["clip_0001"]);
  });

  it("returns one outcome per item, in order, so the model learns why a clip was refused", async () => {
    const { call } = setup();
    await expect(
      call({
        items: [
          { clipId: "clip_0002", reason: "nice" },
          { clipId: "clip_0003", reason: "nice" },
          { clipId: "clip_9999", reason: "nice" },
        ],
      }),
    ).resolves.toEqual({
      outcomes: [
        { clipId: "clip_0002", status: "rejected", reasons: ["TRAINING_NOT_ALLOWED"] },
        { clipId: "clip_0003", status: "accepted" },
        { clipId: "clip_9999", status: "rejected", reasons: ["UNKNOWN_CLIP"] },
      ],
      manifestSize: 1,
    });
  });

  it("lets the model choose clip ids and reasons, and nothing else", () => {
    const { schema } = setup();
    expect(Object.keys(schema.shape)).toEqual(["items"]);
    expect(
      schema.safeParse({ items: [{ clipId: "clip_0001", reason: "ok" }], territory: "JP" }).data,
    ).toEqual({ items: [{ clipId: "clip_0001", reason: "ok" }] });
  });

  it(`accepts batches of 1 to ${MAX_BATCH} items, each with a non-empty reason`, () => {
    const { schema } = setup();
    const item = { clipId: "clip_0001", reason: "ok" };
    expect(schema.safeParse({ items: [] }).success).toBe(false);
    expect(schema.safeParse({ items: Array(MAX_BATCH).fill(item) }).success).toBe(true);
    expect(schema.safeParse({ items: Array(MAX_BATCH + 1).fill(item) }).success).toBe(false);
    expect(schema.safeParse({ items: [{ clipId: "clip_0001", reason: "" }] }).success).toBe(false);
  });
});
