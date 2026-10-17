import { describe, expect, it } from "vitest";
import type { Clip } from "../catalog/schema";
import { rankClips } from "./search";

const clip = (id: string, overrides: Partial<Clip> = {}): Clip => ({
  id,
  title: id,
  description: id,
  genre: "sports_outdoor",
  language: "es",
  durationSec: 20,
  resolution: "1080p",
  license: { trainingAllowed: true, territories: ["ES"], expiresAt: null },
  ...overrides,
});

const catalog = [
  clip("clip_0001"),
  clip("clip_0002", { language: "en" }),
  clip("clip_0003", { durationSec: 45 }),
  clip("clip_0004"),
];

const vectors = {
  clip_0001: [0, 1],
  clip_0002: [1, 0],
  clip_0003: [1, 0],
  clip_0004: [0.8, 0.6],
};

describe("rankClips", () => {
  it("orders clips by similarity to the query", () => {
    const hits = rankClips([1, 0], catalog, vectors, {}, 10);
    expect(hits.map((hit) => hit.clip.id)).toEqual([
      "clip_0002",
      "clip_0003",
      "clip_0004",
      "clip_0001",
    ]);
  });

  it("drops clips that fail an exact filter, however similar they are", () => {
    const hits = rankClips([1, 0], catalog, vectors, { language: "es", maxDurationSec: 30 }, 10);
    expect(hits.map((hit) => hit.clip.id)).toEqual(["clip_0004", "clip_0001"]);
  });

  it("returns at most `limit` hits", () => {
    expect(rankClips([1, 0], catalog, vectors, {}, 2)).toHaveLength(2);
  });

  it("skips clips without a vector instead of failing", () => {
    const hits = rankClips([1, 0], [...catalog, clip("clip_0005")], vectors, {}, 10);
    expect(hits.map((hit) => hit.clip.id)).not.toContain("clip_0005");
  });
});
