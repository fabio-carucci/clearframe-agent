import { readFile } from "node:fs/promises";
import { GetObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { type EmbeddingIndex, EmbeddingIndexSchema } from "../retrieval/embeddings";
import { type Clip, CatalogSchema } from "./schema";

export type JsonReader = (file: string) => Promise<unknown>;

const LOCAL_DATA_DIR = new URL("../../data/", import.meta.url);

export const localJsonReader: JsonReader = async (file) =>
  JSON.parse(await readFile(new URL(file, LOCAL_DATA_DIR), "utf8"));

export const s3JsonReader =
  (s3: Pick<S3Client, "send">, bucket: string, prefix: string): JsonReader =>
  async (file) => {
    const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: `${prefix}${file}` }));
    const body = await object.Body?.transformToString();
    if (body === undefined) throw new Error(`Empty S3 object s3://${bucket}/${prefix}${file}`);
    return JSON.parse(body);
  };

export interface CatalogData {
  clips: Clip[];
  clipsById: Map<string, Clip>;
  index: EmbeddingIndex;
}

export async function loadCatalogData(
  readJson: JsonReader = localJsonReader,
): Promise<CatalogData> {
  const [clips, index] = await Promise.all([
    readJson("catalog.json").then((json) => CatalogSchema.parse(json)),
    readJson("embeddings.json").then((json) => EmbeddingIndexSchema.parse(json)),
  ]);
  return { clips, clipsById: new Map(clips.map((clip) => [clip.id, clip])), index };
}
