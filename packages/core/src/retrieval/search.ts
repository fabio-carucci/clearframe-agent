import { cosineSimilarity } from "ai";
import type { Genre, Language } from "@clearframe/contracts";
import type { Clip } from "../catalog/schema";

export interface SearchFilters {
  language?: Language;
  genre?: Genre;
  maxDurationSec?: number;
}

export interface SearchHit {
  clip: Clip;
  score: number;
}

export function matchesFilters(clip: Clip, filters: SearchFilters): boolean {
  return (
    (filters.language === undefined || clip.language === filters.language) &&
    (filters.genre === undefined || clip.genre === filters.genre) &&
    (filters.maxDurationSec === undefined || clip.durationSec <= filters.maxDurationSec)
  );
}

export function rankClips(
  queryVector: number[],
  catalog: readonly Clip[],
  vectors: Readonly<Record<string, number[]>>,
  filters: SearchFilters,
  limit: number,
): SearchHit[] {
  return catalog
    .filter((clip) => matchesFilters(clip, filters))
    .flatMap((clip) => {
      const vector = vectors[clip.id];
      return vector ? [{ clip, score: cosineSimilarity(queryVector, vector) }] : [];
    })
    .sort((a, b) => b.score - a.score || a.clip.id.localeCompare(b.clip.id))
    .slice(0, limit);
}
