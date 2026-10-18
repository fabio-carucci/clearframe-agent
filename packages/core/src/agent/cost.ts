import { EMBEDDING_MODEL_ID } from "../retrieval/embeddings";
import { MODEL_ID } from "./agent";

/**
 * USD per million tokens. Haiku 5.5 prices hold for prompts up to 100K tokens, which a single
 * agent step stays well below. Titan V2 price from the AWS launch post (April 2024).
 */
export const PRICING = {
  "claude-haiku-5-5": { inputPerMTok: 0.1, outputPerMTok: 0.5 },
  "amazon.titan-embed-text-v2:0": { inputPerMTok: 0.02 },
} as const;

export interface RunTokens {
  inputTokens: number;
  outputTokens: number;
  embeddingTokens: number;
}

export function estimateCostUsd(tokens: RunTokens): number {
  // Indexed by the configured model ids: switching to a model without a price here fails the
  // typecheck instead of silently reporting the old model's cost.
  const llm = PRICING[MODEL_ID];
  const embedding = PRICING[EMBEDDING_MODEL_ID];
  return (
    (tokens.inputTokens * llm.inputPerMTok +
      tokens.outputTokens * llm.outputPerMTok +
      tokens.embeddingTokens * embedding.inputPerMTok) /
    1_000_000
  );
}
