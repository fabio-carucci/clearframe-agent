import { describe, expect, it } from "vitest";
import type { Clip } from "../catalog/schema";
import { ManifestDraft } from "./manifest";

const clip = (id: string, license: Partial<Clip["license"]> = {}): Clip => ({
  id,
  title: `Title ${id}`,
  description: "A clip.",
  genre: "sports_outdoor",
  language: "es",
  durationSec: 20,
  resolution: "1080p",
  license: { trainingAllowed: true, territories: ["ES"], expiresAt: null, ...license },
});

const clips = [
  clip("clip_0001"),
  clip("clip_0002", { trainingAllowed: false }),
  clip("clip_0003", { expiresAt: "2026-10-17" }),
];
const clipsById = new Map(clips.map((c) => [c.id, c]));
const usage = { territory: "ES", date: "2026-10-01" };

describe("ManifestDraft", () => {
  it("accepts a clip whose license passes the rights rule", () => {
    const draft = new ManifestDraft(clipsById, usage);
    expect(draft.propose("clip_0001", "Spanish surf clip")).toEqual({
      clipId: "clip_0001",
      status: "accepted",
    });
    expect(draft.entries).toEqual([
      {
        clipId: "clip_0001",
        title: "Title clip_0001",
        genre: "sports_outdoor",
        language: "es",
        durationSec: 20,
        reason: "Spanish surf clip",
        license: { trainingAllowed: true, territories: ["ES"], expiresAt: null },
        daysUntilExpiry: null,
        expiresSoon: false,
      },
    ]);
  });

  it("flags an accepted clip whose license ends soon after the usage date", () => {
    const draft = new ManifestDraft(clipsById, usage);
    draft.propose("clip_0003", "expires in 16 days");
    expect(draft.entries[0]).toMatchObject({ daysUntilExpiry: 16, expiresSoon: true });
  });

  it("rejects a clip that fails the rights rule and records why", () => {
    const draft = new ManifestDraft(clipsById, usage);
    expect(draft.propose("clip_0002", "looks great")).toEqual({
      clipId: "clip_0002",
      status: "rejected",
      reasons: ["TRAINING_NOT_ALLOWED"],
    });
    expect(draft.entries).toEqual([]);
    expect(draft.rejections).toEqual([{ clipId: "clip_0002", reasons: ["TRAINING_NOT_ALLOWED"] }]);
  });

  it("rejects clip ids that are not in the catalog", () => {
    const draft = new ManifestDraft(clipsById, usage);
    expect(draft.propose("clip_9999", "invented")).toMatchObject({ reasons: ["UNKNOWN_CLIP"] });
  });

  it("does not add the same clip twice", () => {
    const draft = new ManifestDraft(clipsById, usage);
    draft.propose("clip_0001", "first");
    expect(draft.propose("clip_0001", "again")).toMatchObject({ reasons: ["DUPLICATE"] });
    expect(draft.entries).toHaveLength(1);
  });

  it("keeps checking the usage it was created with, even if the caller's object changes", () => {
    const callerUsage = { ...usage };
    const draft = new ManifestDraft(clipsById, callerUsage);
    callerUsage.territory = "US";
    expect(draft.propose("clip_0001", "still Spain")).toMatchObject({ status: "accepted" });
  });
});
