import { describe, expect, it } from "vitest";
import {
  CATALOG_SIZE,
  DEFECT_QUOTAS,
  REFERENCE_DATE,
  TERRITORY_POOLS,
  generateCatalog,
} from "./generate";
import { CatalogSchema } from "./schema";

describe("generateCatalog", () => {
  const catalog = generateCatalog();

  it("returns the same catalog for the same seed", () => {
    expect(generateCatalog()).toEqual(catalog);
  });

  it("returns a different catalog for a different seed", () => {
    expect(generateCatalog(7)).not.toEqual(catalog);
  });

  it("produces schema-valid clips with unique ids", () => {
    expect(() => CatalogSchema.parse(catalog)).not.toThrow();
    expect(new Set(catalog.map((clip) => clip.id)).size).toBe(CATALOG_SIZE);
  });

  it("plants exactly the configured license defects", () => {
    const apac: readonly string[] = TERRITORY_POOLS.apac;

    const notAllowed = catalog.filter((clip) => !clip.license.trainingAllowed);
    const restricted = catalog.filter((clip) =>
      clip.license.territories.every((territory) => apac.includes(territory)),
    );
    const expired = catalog.filter(
      (clip) => clip.license.expiresAt !== null && clip.license.expiresAt < REFERENCE_DATE,
    );

    expect(notAllowed).toHaveLength(DEFECT_QUOTAS.trainingNotAllowed);
    expect(restricted).toHaveLength(DEFECT_QUOTAS.territoryRestricted);
    expect(expired).toHaveLength(DEFECT_QUOTAS.expired);
  });
});
