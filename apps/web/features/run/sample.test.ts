import { RunEventSchema } from "@clearframe/contracts";
import { PUBLISHED_SIGNING_KEYS, verifySignedManifest } from "@clearframe/contracts/certificate";
import { describe, expect, it } from "vitest";
import { recordedResult } from "./replay";
import { SAMPLE_RECORDING } from "./sample";

describe("the recorded sample run", () => {
  it("is a stream of events the current contract accepts, ending with a result", () => {
    for (const event of SAMPLE_RECORDING)
      expect(RunEventSchema.safeParse(event).success).toBe(true);
    expect(recordedResult(SAMPLE_RECORDING).manifest.clips.length).toBeGreaterThan(0);
  });

  it("is signed by the notary with a published key, as the deployed API now signs every run", async () => {
    const { manifest, certificate } = recordedResult(SAMPLE_RECORDING);
    const check = await verifySignedManifest({ manifest, certificate }, PUBLISHED_SIGNING_KEYS);
    expect(check.status).toBe("valid");
  });
});
