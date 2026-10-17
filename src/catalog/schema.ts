import { z } from "zod";

export const GENRES = [
  "sports_outdoor",
  "sports_indoor",
  "cooking",
  "street_urban",
  "nature_wildlife",
  "interview",
  "music_performance",
  "workplace",
] as const;

/** ISO 639-1 code of the spoken language in the clip. */
export const LANGUAGES = ["en", "es", "it", "fr", "de", "pt"] as const;

export const RESOLUTIONS = ["720p", "1080p", "2160p"] as const;

export const GenreSchema = z.enum(GENRES);
export const LanguageSchema = z.enum(LANGUAGES);
export const ResolutionSchema = z.enum(RESOLUTIONS);

/** ISO 3166-1 alpha-2 country code. */
export const TerritorySchema = z.string().regex(/^[A-Z]{2}$/);

/** Calendar date as YYYY-MM-DD; rejects impossible dates such as 2026-02-30. */
export const IsoDateSchema = z.iso.date();

export const LicenseSchema = z.object({
  trainingAllowed: z.boolean(),
  territories: z.array(TerritorySchema).min(1),
  /** Day the license expires (YYYY-MM-DD), already invalid on that day; null for a perpetual license. */
  expiresAt: IsoDateSchema.nullable(),
});

export const ClipSchema = z.object({
  id: z.string().regex(/^clip_\d{4}$/),
  title: z.string().min(1),
  description: z.string().min(1),
  genre: GenreSchema,
  language: LanguageSchema,
  durationSec: z.number().int().positive(),
  resolution: ResolutionSchema,
  license: LicenseSchema,
});

export const CatalogSchema = z.array(ClipSchema);

export type Genre = z.infer<typeof GenreSchema>;
export type Language = z.infer<typeof LanguageSchema>;
export type Resolution = z.infer<typeof ResolutionSchema>;
export type License = z.infer<typeof LicenseSchema>;
export type Clip = z.infer<typeof ClipSchema>;
