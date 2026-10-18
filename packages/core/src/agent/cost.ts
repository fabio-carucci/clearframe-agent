import { EMBEDDING_MODEL_ID } from "../retrieval/embeddings";

export interface ModelPrice {
  inputPerMTok: number;
  outputPerMTok: number;
}

/**
 * USD per million tokens, by model id. Haiku 5.5 prices hold for prompts up to 100K tokens, which
 * a single agent step stays well below.
 */
export const MODEL_PRICES: Readonly<Record<string, ModelPrice>> = {
  "claude-haiku-5-5": { inputPerMTok: 0.1, outputPerMTok: 0.5 },
};

/** USD per million input tokens, from the AWS launch post (April 2024). */
export const EMBEDDING_PRICES: Readonly<Record<string, number>> = {
  "amazon.titan-embed-text-v2:0": 0.02,
};

/**
 * A model without a price would be reported at the wrong cost, with nothing to notice it: runs
 * look the price up before they call the model, and fail here instead.
 */
export function priceOf(modelId: string): ModelPrice {
  const price = MODEL_PRICES[modelId];
  if (!price) throw new Error(`No price for model ${modelId}; add it to MODEL_PRICES`);
  return price;
}

export interface RunTokens {
  inputTokens: number;
  outputTokens: number;
  embeddingTokens: number;
}

export function estimateCostUsd(tokens: RunTokens, price: ModelPrice): number {
  const embeddingPerMTok = EMBEDDING_PRICES[EMBEDDING_MODEL_ID] ?? 0;
  return (
    (tokens.inputTokens * price.inputPerMTok +
      tokens.outputTokens * price.outputPerMTok +
      tokens.embeddingTokens * embeddingPerMTok) /
    1_000_000
  );
}
