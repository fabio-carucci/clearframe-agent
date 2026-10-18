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

/** ISO 639-1 code of the spoken language in a clip. */
export const LANGUAGES = ["en", "es", "it", "fr", "de", "pt"] as const;

export const GenreSchema = z.enum(GENRES);
export const LanguageSchema = z.enum(LANGUAGES);

/** ISO 3166-1 alpha-2 country code. */
export const TerritorySchema = z.string().regex(/^[A-Z]{2}$/);

/** Calendar date as YYYY-MM-DD; rejects impossible dates such as 2026-02-30. */
export const IsoDateSchema = z.iso.date();

export const RIGHTS_VIOLATIONS = [
  "TRAINING_NOT_ALLOWED",
  "TERRITORY_NOT_LICENSED",
  "LICENSE_EXPIRED",
] as const;

export const PROPOSAL_REJECTIONS = [...RIGHTS_VIOLATIONS, "UNKNOWN_CLIP", "DUPLICATE"] as const;

/** Body of POST /api. The usage date defaults to today on the server. */
export const ComposeRequestSchema = z.object({
  prompt: z.string().min(1).max(2000),
  territory: TerritorySchema,
  date: IsoDateSchema.optional(),
});

export const ManifestEntrySchema = z.object({
  clipId: z.string(),
  title: z.string(),
  genre: GenreSchema,
  language: LanguageSchema,
  durationSec: z.number().int().positive(),
  reason: z.string().min(1),
});

export const RejectionSchema = z.object({
  clipId: z.string(),
  reasons: z.array(z.enum(PROPOSAL_REJECTIONS)).min(1),
});

export const StopReasonSchema = z.enum(["completed", "step_limit", "token_budget", "error"]);

export const ManifestSchema = z.object({
  runId: z.uuid(),
  request: z.object({
    prompt: z.string().min(1),
    territory: TerritorySchema,
    date: IsoDateSchema,
  }),
  clips: z.array(ManifestEntrySchema),
  rejected: z.array(RejectionSchema),
  stopReason: StopReasonSchema,
  summary: z.string(),
  usage: z.object({
    steps: z.number().int().nonnegative(),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    embeddingTokens: z.number().int().nonnegative(),
  }),
  costUsd: z.number().nonnegative(),
  durationMs: z.number().nonnegative(),
});

/** One model call in a run: the tools it asked for, its tokens and how long it took. */
export const StepSchema = z.object({
  stepNumber: z.number().int().nonnegative(),
  toolCalls: z.array(z.string()),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative(),
});

/** Response of POST /api, also sent with status 502 when a run fails part-way. */
export const ComposeResponseSchema = z.object({
  manifest: ManifestSchema,
  steps: z.array(StepSchema),
});

export type Genre = z.infer<typeof GenreSchema>;
export type Language = z.infer<typeof LanguageSchema>;
export type RightsViolation = (typeof RIGHTS_VIOLATIONS)[number];
export type ProposalRejection = (typeof PROPOSAL_REJECTIONS)[number];
export type ComposeRequest = z.infer<typeof ComposeRequestSchema>;
export type ManifestEntry = z.infer<typeof ManifestEntrySchema>;
export type Rejection = z.infer<typeof RejectionSchema>;
export type StopReason = z.infer<typeof StopReasonSchema>;
export type Manifest = z.infer<typeof ManifestSchema>;
export type Step = z.infer<typeof StepSchema>;
export type ComposeResponse = z.infer<typeof ComposeResponseSchema>;
