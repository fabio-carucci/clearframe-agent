import { createHash } from "node:crypto";
import {
  type AmazonBedrockEmbeddingModelOptions,
  createAmazonBedrock,
} from "@ai-sdk/amazon-bedrock";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { embed, embedMany } from "ai";
import { z } from "zod";
import type { Clip } from "../catalog/schema";

export const EMBEDDING_MODEL_ID = "amazon.titan-embed-text-v2:0";
export const EMBEDDING_DIMENSIONS = 512;

const bedrock = createAmazonBedrock({
  region: process.env.AWS_REGION ?? "eu-west-1",
  // Without it the provider reads only static AWS_ACCESS_KEY_ID-style env vars and ignores
  // the SSO profile; the chain also resolves the Lambda execution role and CI OIDC credentials.
  credentialProvider: fromNodeProviderChain(),
});

const embeddingModel = bedrock.embeddingModel(EMBEDDING_MODEL_ID);

const providerOptions = {
  bedrock: {
    dimensions: EMBEDDING_DIMENSIONS,
    normalize: true,
  } satisfies AmazonBedrockEmbeddingModelOptions,
};

export const clipEmbeddingText = (clip: Pick<Clip, "title" | "description">) =>
  `${clip.title}. ${clip.description}`;

/** Changes whenever the text that was embedded changes, so a stale index can be detected. */
export function catalogFingerprint(clips: readonly Clip[]): string {
  const embedded = clips.map((clip) => [clip.id, clipEmbeddingText(clip)]);
  return createHash("sha256").update(JSON.stringify(embedded)).digest("hex");
}

export async function embedTexts(texts: string[]) {
  const { embeddings, usage } = await embedMany({
    model: embeddingModel,
    values: texts,
    maxParallelCalls: 4,
    providerOptions,
  });
  return { embeddings, tokens: usage.tokens };
}

export async function embedQuery(text: string) {
  const { embedding, usage } = await embed({ model: embeddingModel, value: text, providerOptions });
  return { embedding, tokens: usage.tokens };
}

export const EmbeddingIndexSchema = z.object({
  model: z.literal(EMBEDDING_MODEL_ID),
  dimensions: z.literal(EMBEDDING_DIMENSIONS),
  catalogSha256: z.string().length(64),
  vectors: z.record(z.string(), z.array(z.number()).length(EMBEDDING_DIMENSIONS)),
});

export type EmbeddingIndex = z.infer<typeof EmbeddingIndexSchema>;
