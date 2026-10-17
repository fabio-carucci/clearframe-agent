import { readFile } from "node:fs/promises";
import { type EmbeddingIndex, EmbeddingIndexSchema } from "../retrieval/embeddings";
import { type Clip, CatalogSchema } from "./schema";

const DATA_DIR = new URL("../../data/", import.meta.url);

const readJson = async (file: string): Promise<unknown> =>
  JSON.parse(await readFile(new URL(file, DATA_DIR), "utf8"));

export interface CatalogData {
  clips: Clip[];
  clipsById: Map<string, Clip>;
  index: EmbeddingIndex;
}

export async function loadCatalogData(): Promise<CatalogData> {
  const [clips, index] = await Promise.all([
    readJson("catalog.json").then((json) => CatalogSchema.parse(json)),
    readJson("embeddings.json").then((json) => EmbeddingIndexSchema.parse(json)),
  ]);
  return { clips, clipsById: new Map(clips.map((clip) => [clip.id, clip])), index };
}
