import type { ManifestEntry, ProposalRejection, Rejection } from "@clearframe/contracts";
import type { Clip } from "../catalog/schema";
import {
  type RightsDecision,
  type UsageRequest,
  checkTrainingRights,
} from "../rights/check-training-rights";

export type ProposalOutcome =
  | { clipId: string; status: "accepted" }
  | { clipId: string; status: "rejected"; reasons: ProposalRejection[] };

export interface ManifestWriter {
  readonly usage: Readonly<UsageRequest>;
  readonly entries: ManifestEntry[];
  readonly rejections: Rejection[];
  readonly enforcesRights: boolean;
  /** The rule's verdict for this draft's territory and date, or null when it applies no rule. */
  assess(clip: Clip): RightsDecision | null;
  propose(clipId: string, reason: string): ProposalOutcome;
}

/**
 * The only way to put a clip in a manifest. Territory and date are fixed when the draft is
 * created, so the model can propose clips but never choose what the rights rule checks.
 */
export class ManifestDraft implements ManifestWriter {
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

  readonly enforcesRights = true;

  assess(clip: Clip): RightsDecision {
    return checkTrainingRights(clip.license, this.#usage);
  }

  propose(clipId: string, reason: string): ProposalOutcome {
    const clip = this.#clipsById.get(clipId);
    if (!clip) return this.#reject(clipId, ["UNKNOWN_CLIP"]);
    if (this.#entries.has(clipId)) return { clipId, status: "rejected", reasons: ["DUPLICATE"] };

    const decision = this.assess(clip);
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
