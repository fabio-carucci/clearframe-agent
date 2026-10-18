import { GenreSchema, IsoDateSchema, LanguageSchema, TerritorySchema } from "@clearframe/contracts";
import { z } from "zod";

export const RESOLUTIONS = ["720p", "1080p", "2160p"] as const;

export const ResolutionSchema = z.enum(RESOLUTIONS);

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

export type Resolution = z.infer<typeof ResolutionSchema>;
export type License = z.infer<typeof LicenseSchema>;
export type Clip = z.infer<typeof ClipSchema>;
