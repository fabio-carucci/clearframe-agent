import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  type EmbeddingIndex,
  EmbeddingIndexSchema,
  catalogFingerprint,
} from "../retrieval/embeddings";
import { type Clip, CatalogSchema } from "./schema";

export type JsonReader = (file: string) => Promise<unknown>;

const LOCAL_DATA_DIR = new URL("../../../../data/", import.meta.url);

export const localJsonReader: JsonReader = async (file) =>
  JSON.parse(await readFile(new URL(file, LOCAL_DATA_DIR), "utf8"));

export interface CatalogData {
  clips: Clip[];
  clipsById: Map<string, Clip>;
  index: EmbeddingIndex;
  /** SHA-256 of the catalog as loaded, licenses included: which catalog a decision was made on. */
  version: string;
}

export async function loadCatalogData(
  readJson: JsonReader = localJsonReader,
): Promise<CatalogData> {
  const [catalogJson, indexJson] = await Promise.all([
    readJson("catalog.json"),
    readJson("embeddings.json"),
  ]);
  const clips = CatalogSchema.parse(catalogJson);
  const index = EmbeddingIndexSchema.parse(indexJson);
  // The two files are uploaded separately; a load between the uploads would pair vectors with
  // the wrong descriptions and rank clips by text they no longer have.
  if (index.catalogSha256 !== catalogFingerprint(clips)) {
    throw new Error("embeddings.json was not built from this catalog.json; run pnpm catalog:embed");
  }
  return {
    clips,
    clipsById: new Map(clips.map((clip) => [clip.id, clip])),
    index,
    version: createHash("sha256").update(JSON.stringify(clips)).digest("hex"),
  };
}
