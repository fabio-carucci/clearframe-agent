import { mkdir, writeFile } from "node:fs/promises";
import {
  CATALOG_SEED,
  REFERENCE_DATE,
  TERRITORY_POOLS,
  generateCatalog,
} from "../src/catalog/generate";
import { CatalogSchema, type Clip } from "../src/catalog/schema";

const DATA_DIR = new URL("../../../data/", import.meta.url);

const catalog = CatalogSchema.parse(generateCatalog(CATALOG_SEED));
await mkdir(DATA_DIR, { recursive: true });
await writeFile(new URL("catalog.json", DATA_DIR), `${JSON.stringify(catalog, null, 2)}\n`);

const countBy = (key: (clip: Clip) => string) =>
  Object.fromEntries(
    Object.entries(Object.groupBy(catalog, key)).map(([k, clips]) => [k, clips?.length ?? 0]),
  );

const apac: readonly string[] = TERRITORY_POOLS.apac;
const licenseStatus = (clip: Clip) => {
  if (!clip.license.trainingAllowed) return "training not allowed";
  if (clip.license.territories.every((t) => apac.includes(t))) return "territory restricted";
  if (clip.license.expiresAt !== null && clip.license.expiresAt < REFERENCE_DATE) return "expired";
  return "clean";
};

console.log(`Wrote ${catalog.length} clips to data/catalog.json (seed ${CATALOG_SEED})\n`);
console.log(
  "By genre:",
  countBy((clip) => clip.genre),
);
console.log(
  "By language:",
  countBy((clip) => clip.language),
);
console.log("By license status:", countBy(licenseStatus));
console.log(
  "Clean Spanish outdoor sports clips <= 30s:",
  catalog.filter(
    (clip) =>
      clip.genre === "sports_outdoor" &&
      clip.language === "es" &&
      clip.durationSec <= 30 &&
      licenseStatus(clip) === "clean",
  ).length,
);
