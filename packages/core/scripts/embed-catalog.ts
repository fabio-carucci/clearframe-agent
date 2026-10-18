import { readFile, writeFile } from "node:fs/promises";
import { CatalogSchema } from "../src/catalog/schema";
import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL_ID,
  type EmbeddingIndex,
  catalogFingerprint,
  clipEmbeddingText,
  embedTexts,
} from "../src/retrieval/embeddings";

const DATA_DIR = new URL("../../../data/", import.meta.url);

const catalog = CatalogSchema.parse(
  JSON.parse(await readFile(new URL("catalog.json", DATA_DIR), "utf8")),
);

const startedAt = performance.now();
const { embeddings, tokens } = await embedTexts(catalog.map(clipEmbeddingText));
const seconds = ((performance.now() - startedAt) / 1000).toFixed(1);

// Six decimals halve the file size; cosine scores move by less than 1e-5.
const round = (value: number) => Math.round(value * 1e6) / 1e6;

const index: EmbeddingIndex = {
  model: EMBEDDING_MODEL_ID,
  dimensions: EMBEDDING_DIMENSIONS,
  catalogSha256: catalogFingerprint(catalog),
  vectors: Object.fromEntries(catalog.map((clip, i) => [clip.id, embeddings[i]!.map(round)])),
};

await writeFile(new URL("embeddings.json", DATA_DIR), `${JSON.stringify(index)}\n`);

console.log(
  `Embedded ${catalog.length} clips with ${EMBEDDING_MODEL_ID} in ${seconds}s (${tokens} input tokens)`,
);
