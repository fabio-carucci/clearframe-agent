import { z } from "zod";
import {
  type Clip,
  GenreSchema,
  IsoDateSchema,
  LanguageSchema,
  TerritorySchema,
} from "../catalog/schema";
import {
  RIGHTS_VIOLATIONS,
  type UsageRequest,
  checkTrainingRights,
} from "../rights/check-training-rights";

export const PROPOSAL_REJECTIONS = [
  ...RIGHTS_VIOLATIONS,
  "UNKNOWN_CLIP",
  "DUPLICATE",
] as const;

export type ProposalRejection = (typeof PROPOSAL_REJECTIONS)[number];

export type ProposalOutcome =
  | { clipId: string; status: "accepted" }
  | { clipId: string; status: "rejected"; reasons: ProposalRejection[] };

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

export const StopReasonSchema = z.enum([
  "completed",
  "step_limit",
  "token_budget",
]);

export const ManifestSchema = z.object({
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

export type ManifestEntry = z.infer<typeof ManifestEntrySchema>;
export type Rejection = z.infer<typeof RejectionSchema>;
export type StopReason = z.infer<typeof StopReasonSchema>;
export type Manifest = z.infer<typeof ManifestSchema>;

/**
 * The only way to put a clip in a manifest. Territory and date are fixed when the draft is
 * created, so the model can propose clips but never choose what the rights rule checks.
 */
export class ManifestDraft {
  readonly #clipsById: ReadonlyMap<string, Clip>;
  readonly #usage: UsageRequest;
  readonly #entries = new Map<string, ManifestEntry>();
  readonly #rejections: Rejection[] = [];

  constructor(clipsById: ReadonlyMap<string, Clip>, usage: UsageRequest) {
    this.#clipsById = clipsById;
    this.#usage = { ...usage };
  }

  get usage(): Readonly<UsageRequest> {
    return this.#usage;
  }

  get entries(): ManifestEntry[] {
    return [...this.#entries.values()];
  }

  get rejections(): Rejection[] {
    return [...this.#rejections];
  }

  propose(clipId: string, reason: string): ProposalOutcome {
    const clip = this.#clipsById.get(clipId);
    if (!clip) return this.#reject(clipId, ["UNKNOWN_CLIP"]);
    if (this.#entries.has(clipId))
      return { clipId, status: "rejected", reasons: ["DUPLICATE"] };

    const decision = checkTrainingRights(clip.license, this.#usage);
    if (!decision.allowed) return this.#reject(clipId, decision.reasons);

    this.#entries.set(clipId, {
      clipId,
      title: clip.title,
      genre: clip.genre,
      language: clip.language,
      durationSec: clip.durationSec,
      reason,
    });
    return { clipId, status: "accepted" };
  }

  #reject(clipId: string, reasons: ProposalRejection[]): ProposalOutcome {
    this.#rejections.push({ clipId, reasons });
    return { clipId, status: "rejected", reasons };
  }
}
