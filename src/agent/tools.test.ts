import { describe, expect, it } from "vitest";
import type { Clip } from "../catalog/schema";
import type { EmbeddingIndex } from "../retrieval/embeddings";
import type { RunContext } from "./context";
import { ManifestDraft, type ManifestWriter } from "./manifest";
import { createGetRightsTool, createSearchClipsTool } from "./tools";

const clip = (id: string, territories: string[]): Clip => ({
  id,
  title: id,
  description: id,
  genre: "cooking",
  language: "es",
  durationSec: 20,
  resolution: "1080p",
  license: { trainingAllowed: true, territories, expiresAt: null },
});

const clips = [clip("clip_0001", ["ES"]), clip("clip_0002", ["JP"])];
const clipsById = new Map(clips.map((c) => [c.id, c]));
const usage = { territory: "ES", date: "2026-10-17" };

/** A draft that applies no rule, like the eval ablation, without importing from evals/. */
const ruleFreeDraft = (): ManifestWriter => ({
  usage,
  entries: [],
  rejections: [],
  enforcesRights: false,
  assess: () => null,
  propose: () => {
    throw new Error("not used by these tests");
  },
});

function runWith(draft: ManifestWriter): RunContext {
  return {
    data: {
      clips,
      clipsById,
      index: { vectors: { clip_0001: [1, 0], clip_0002: [1, 0] } } as unknown as EmbeddingIndex,
    },
    draft,
    embedQuery: async () => ({ embedding: [1, 0], tokens: 3 }),
    stats: { embeddingTokens: 0 },
  };
}

const call = (t: { execute?: unknown }, input: unknown) =>
  (t.execute as (input: unknown, options: unknown) => Promise<unknown>)(input, {
    toolCallId: "call_1",
    messages: [],
  });

describe("searchClips", () => {
  it("only returns clips licensed for the run's territory and date", async () => {
    const run = runWith(new ManifestDraft(clipsById, usage));
    const hits = (await call(createSearchClipsTool(run), { query: "cooking", limit: 10 })) as {
      clipId: string;
    }[];
    expect(hits.map((hit) => hit.clipId)).toEqual(["clip_0001"]);
    expect(run.stats.embeddingTokens).toBe(3);
  });

  it("returns every clip when the draft applies no rule (ablation)", async () => {
    const run = runWith(ruleFreeDraft());
    const hits = (await call(createSearchClipsTool(run), { query: "cooking", limit: 10 })) as {
      clipId: string;
    }[];
    expect(hits.map((hit) => hit.clipId)).toEqual(["clip_0001", "clip_0002"]);
  });
});

describe("getRights", () => {
  it("adds the rule's verdict when the draft enforces rights", async () => {
    const run = runWith(new ManifestDraft(clipsById, usage));
    await expect(call(createGetRightsTool(run), { clipIds: ["clip_0002"] })).resolves.toEqual([
      {
        clipId: "clip_0002",
        license: clips[1]!.license,
        eligible: false,
        reasons: ["TERRITORY_NOT_LICENSED"],
      },
    ]);
  });

  it("returns only the raw license when the draft applies no rule (ablation)", async () => {
    const run = runWith(ruleFreeDraft());
    await expect(call(createGetRightsTool(run), { clipIds: ["clip_0002"] })).resolves.toEqual([
      { clipId: "clip_0002", license: clips[1]!.license },
    ]);
  });
});
