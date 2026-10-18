import { describe, expect, it } from "vitest";
import type { Clip } from "../catalog/schema";
import { DecisionLog } from "./decisions";

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
const log = () => new DecisionLog(new Map([[clip.id, clip]]));

describe("DecisionLog", () => {
  it("fills catalog fields for known clips and nulls for unknown ones", () => {
    const decisions = log();
    expect(decisions.record("clip_0001", "accepted", [])).toMatchObject({
      title: "Surf",
      genre: "sports_outdoor",
      durationSec: 20,
    });
    expect(decisions.record("clip_9999", "refused", ["UNKNOWN_CLIP"])).toMatchObject({
      title: null,
      genre: null,
      durationSec: null,
    });
  });

  it("turns clips that were only checked into not proposed at the end", () => {
    const decisions = log();
    decisions.record("clip_0001", "checked", ["LICENSE_EXPIRED"]);
    expect(decisions.final()).toEqual([
      expect.objectContaining({ outcome: "not_proposed", reasons: ["LICENSE_EXPIRED"] }),
    ]);
  });

  it("keeps the rule's verdict when the clip is checked or proposed again", () => {
    const decisions = log();
    decisions.record("clip_0001", "accepted", []);
    decisions.record("clip_0001", "checked", []);
    decisions.record("clip_0001", "refused", ["DUPLICATE"]);
    expect(decisions.final()).toEqual([expect.objectContaining({ outcome: "accepted" })]);
  });

  it("keeps the order in which clips were first touched", () => {
    const decisions = new DecisionLog(new Map());
    decisions.record("b", "checked", []);
    decisions.record("a", "refused", ["UNKNOWN_CLIP"]);
    decisions.record("b", "accepted", []);
    expect(decisions.final().map((d) => d.clipId)).toEqual(["b", "a"]);
  });
});
