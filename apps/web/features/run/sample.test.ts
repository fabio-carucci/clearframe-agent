import { RunEventSchema } from "@clearframe/contracts";
import { describe, expect, it } from "vitest";
import { recordedResult } from "./replay";
import { SAMPLE_RECORDING } from "./sample";

describe("the recorded sample run", () => {
  it("is a stream of events the current contract accepts, ending with a result", () => {
    for (const event of SAMPLE_RECORDING)
      expect(RunEventSchema.safeParse(event).success).toBe(true);
    expect(recordedResult(SAMPLE_RECORDING).manifest.clips.length).toBeGreaterThan(0);
  });
});
