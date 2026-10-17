import type { Clip, Genre, Language, License, Resolution } from "./schema";
import { SHOTS, VOCABULARY } from "./vocabulary";

export const CATALOG_SEED = 42;
export const CATALOG_SIZE = 300;

/** Fixed "today" for the generated catalog, so expiry dates never drift between runs. */
export const REFERENCE_DATE = "2026-10-01";

/** Each defective clip has exactly one license problem; the rest are clean. */
export const DEFECT_QUOTAS = {
  trainingNotAllowed: 30,
  territoryRestricted: 30,
  expired: 30,
} as const;

type Defect = keyof typeof DEFECT_QUOTAS | "none";

export const TERRITORY_POOLS = {
  eu: ["ES", "IT", "FR", "DE", "PT"],
  northAmerica: ["US", "CA"],
  latam: ["MX", "AR", "CO"],
  uk: ["GB"],
  /** Restricted clips are licensed only here, outside every market the other pools cover. */
  apac: ["JP", "KR", "SG", "AU"],
} as const;

const GENRE_WEIGHTS: Record<Genre, number> = {
  sports_outdoor: 18,
  sports_indoor: 12,
  cooking: 12,
  street_urban: 12,
  nature_wildlife: 12,
  interview: 12,
  music_performance: 11,
  workplace: 11,
};

const LANGUAGE_WEIGHTS: Record<Language, number> = {
  en: 30,
  es: 25,
  it: 15,
  fr: 10,
  de: 10,
  pt: 10,
};

const RESOLUTION_WEIGHTS: Record<Resolution, number> = {
  "720p": 20,
  "1080p": 55,
  "2160p": 25,
};

/** mulberry32: tiny seeded PRNG, uniform floats in [0, 1). */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createRandom(seed: number) {
  const next = mulberry32(seed);

  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!;

  const weighted = <K extends string>(weights: Record<K, number>): K => {
    const entries = Object.entries(weights) as [K, number][];
    const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = next() * total;
    for (const [key, weight] of entries) {
      roll -= weight;
      if (roll < 0) return key;
    }
    return entries.at(-1)![0];
  };

  const shuffle = <T>(items: readonly T[]): T[] => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = int(0, i);
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
    }
    return copy;
  };

  return { next, int, pick, weighted, shuffle, chance: (p: number) => next() < p };
}

type Random = ReturnType<typeof createRandom>;

const DAY_MS = 86_400_000;

function addDays(isoDate: string, days: number): string {
  return new Date(Date.parse(isoDate) + days * DAY_MS).toISOString().slice(0, 10);
}

function dateBetween(rand: Random, from: string, to: string): string {
  const span = Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
  return addDays(from, rand.int(0, span));
}

function openTerritories(rand: Random): string[] {
  return [
    ...TERRITORY_POOLS.eu,
    ...(rand.chance(0.6) ? TERRITORY_POOLS.northAmerica : []),
    ...(rand.chance(0.5) ? TERRITORY_POOLS.latam : []),
    ...(rand.chance(0.5) ? TERRITORY_POOLS.uk : []),
  ];
}

function makeLicense(rand: Random, defect: Defect): License {
  const territories =
    defect === "territoryRestricted"
      ? rand.shuffle(TERRITORY_POOLS.apac).slice(0, rand.int(1, 3))
      : openTerritories(rand);

  let expiresAt: string | null;
  if (defect === "expired") {
    expiresAt = dateBetween(rand, addDays(REFERENCE_DATE, -640), addDays(REFERENCE_DATE, -1));
  } else if (rand.chance(0.5)) {
    expiresAt = null;
  } else {
    expiresAt = dateBetween(rand, addDays(REFERENCE_DATE, 31), "2029-12-31");
  }

  return { trainingAllowed: defect !== "trainingNotAllowed", territories, expiresAt };
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const stripArticle = (text: string) => text.replace(/^(a|an|the) /, "");

function makeClip(rand: Random, index: number, defect: Defect): Clip {
  const genre = rand.weighted(GENRE_WEIGHTS);
  const vocabulary = VOCABULARY[genre];
  const activity = rand.pick(vocabulary.activities);
  const setting = rand.pick(activity.settings);
  const description =
    `${capitalize(rand.pick(SHOTS))} of ${rand.pick(vocabulary.subjects)} ` +
    `${activity.phrase} ${setting}, ${rand.pick(vocabulary.lighting)}.`;

  return {
    id: `clip_${String(index + 1).padStart(4, "0")}`,
    title: `${activity.title}, ${stripArticle(setting)}`,
    description,
    genre,
    language: rand.weighted(LANGUAGE_WEIGHTS),
    durationSec: rand.chance(0.6) ? rand.int(5, 30) : rand.int(31, 120),
    resolution: rand.weighted(RESOLUTION_WEIGHTS),
    license: makeLicense(rand, defect),
  };
}

export function generateCatalog(seed: number = CATALOG_SEED): Clip[] {
  const rand = createRandom(seed);
  const defectCount = Object.values(DEFECT_QUOTAS).reduce((sum, n) => sum + n, 0);
  const defects = rand.shuffle<Defect>([
    ...Array<Defect>(CATALOG_SIZE - defectCount).fill("none"),
    ...Object.entries(DEFECT_QUOTAS).flatMap(([defect, count]) =>
      Array<Defect>(count).fill(defect as Defect),
    ),
  ]);
  return defects.map((defect, index) => makeClip(rand, index, defect));
}
