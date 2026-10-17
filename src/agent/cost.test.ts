import { describe, expect, it } from "vitest";
import { estimateCostUsd } from "./cost";

describe("estimateCostUsd", () => {
  it("prices input, output and embedding tokens separately", () => {
    expect(
      estimateCostUsd({
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        embeddingTokens: 1_000_000,
      }),
    ).toBeCloseTo(0.1 + 0.5 + 0.02, 10);
  });

  it("is zero for an empty run", () => {
    expect(estimateCostUsd({ inputTokens: 0, outputTokens: 0, embeddingTokens: 0 })).toBe(0);
  });
});
