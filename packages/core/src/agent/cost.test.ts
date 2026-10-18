import { describe, expect, it } from "vitest";
import { EMBEDDING_MODEL_ID } from "../retrieval/embeddings";
import { MODEL_ID } from "./agent";
import { EMBEDDING_PRICES, estimateCostUsd, priceOf } from "./cost";

describe("estimateCostUsd", () => {
  it("prices input, output and embedding tokens separately", () => {
    expect(
      estimateCostUsd(
        { inputTokens: 1_000_000, outputTokens: 1_000_000, embeddingTokens: 1_000_000 },
        { inputPerMTok: 0.1, outputPerMTok: 0.5 },
      ),
    ).toBeCloseTo(0.1 + 0.5 + 0.02, 10);
  });

  it("is zero for an empty run", () => {
    const tokens = { inputTokens: 0, outputTokens: 0, embeddingTokens: 0 };
    expect(estimateCostUsd(tokens, priceOf(MODEL_ID))).toBe(0);
  });
});

describe("priceOf", () => {
  it("knows the default model and the embedding model", () => {
    expect(priceOf(MODEL_ID)).toBeDefined();
    expect(EMBEDDING_PRICES[EMBEDDING_MODEL_ID]).toBeDefined();
  });

  it("refuses a model it has no price for, instead of reporting a wrong cost", () => {
    expect(() => priceOf("some-other-model")).toThrow("No price for model some-other-model");
  });
});
