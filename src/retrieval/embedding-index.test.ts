import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CatalogSchema } from "../catalog/schema";
import { EmbeddingIndexSchema, catalogFingerprint } from "./embeddings";

const readData = (file: string) =>
  JSON.parse(readFileSync(new URL(`../../data/${file}`, import.meta.url), "utf8"));

describe("committed embedding index", () => {
  const catalog = CatalogSchema.parse(readData("catalog.json"));
  const index = EmbeddingIndexSchema.parse(readData("embeddings.json"));

  it("was built from the current catalog (rerun `pnpm catalog:embed` if not)", () => {
    expect(index.catalogSha256).toBe(catalogFingerprint(catalog));
  });

  it("has one unit-length vector per clip", () => {
    expect(Object.keys(index.vectors).sort()).toEqual(catalog.map((clip) => clip.id).sort());
    for (const vector of Object.values(index.vectors)) {
      const norm = Math.hypot(...vector);
      expect(norm).toBeCloseTo(1, 4);
    }
  });
});
