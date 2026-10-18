import { describe, expect, it } from "vitest";
import { catalogFingerprint } from "../retrieval/embeddings";
import { loadCatalogData } from "./load";
import type { Clip } from "./schema";

const clip: Clip = {
  id: "clip_0001",
  title: "Surf",
  description: "Surf at dawn.",
  genre: "sports_outdoor",
  language: "es",
  durationSec: 20,
  resolution: "1080p",
  license: { trainingAllowed: true, territories: ["ES"], expiresAt: null },
};

const indexFor = (clips: Clip[]) => ({
  model: "amazon.titan-embed-text-v2:0",
  dimensions: 512,
  catalogSha256: catalogFingerprint(clips),
  vectors: { clip_0001: Array(512).fill(0) },
});

const reader = (catalog: unknown, index: unknown) => async (file: string) =>
  file === "catalog.json" ? catalog : index;

describe("loadCatalogData", () => {
  it("loads a catalog whose embedding index was built from it", async () => {
    const data = await loadCatalogData(reader([clip], indexFor([clip])));
    expect(data.clipsById.get("clip_0001")).toEqual(clip);
    expect(data.version).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses an index built from a different catalog", async () => {
    const edited = { ...clip, description: "Kayak on a lake." };
    await expect(loadCatalogData(reader([edited], indexFor([clip])))).rejects.toThrow(
      /catalog:embed/,
    );
  });

  it("changes the version when only a license changes", async () => {
    const revoked = { ...clip, license: { ...clip.license, trainingAllowed: false } };
    const before = await loadCatalogData(reader([clip], indexFor([clip])));
    const after = await loadCatalogData(reader([revoked], indexFor([revoked])));
    expect(after.version).not.toBe(before.version);
  });
});
