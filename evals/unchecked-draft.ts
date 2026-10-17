import type {
  ManifestEntry,
  ManifestWriter,
  ProposalOutcome,
  Rejection,
} from "../src/agent/manifest";
import type { Clip } from "../src/catalog/schema";
import type { UsageRequest } from "../src/rights/check-training-rights";

/**
 * Ablation only: a draft that trusts the model and skips the rights rule, to measure how many
 * violations the model makes on its own. Lives under evals/ so production code cannot import it.
 */
export class UncheckedManifestDraft implements ManifestWriter {
  readonly #clipsById: ReadonlyMap<string, Clip>;
  readonly #entries = new Map<string, ManifestEntry>();
  readonly #rejections: Rejection[] = [];
  readonly usage: Readonly<UsageRequest>;

  constructor(clipsById: ReadonlyMap<string, Clip>, usage: UsageRequest) {
    this.#clipsById = clipsById;
    this.usage = { ...usage };
  }

  get entries(): ManifestEntry[] {
    return [...this.#entries.values()];
  }

  get rejections(): Rejection[] {
    return [...this.#rejections];
  }

  readonly enforcesRights = false;

  assess(): null {
    return null;
  }

  propose(clipId: string, reason: string): ProposalOutcome {
    const clip = this.#clipsById.get(clipId);
    if (!clip) {
      this.#rejections.push({ clipId, reasons: ["UNKNOWN_CLIP"] });
      return { clipId, status: "rejected", reasons: ["UNKNOWN_CLIP"] };
    }
    if (this.#entries.has(clipId)) return { clipId, status: "rejected", reasons: ["DUPLICATE"] };
    const { id, title, genre, language, durationSec } = clip;
    this.#entries.set(clipId, { clipId: id, title, genre, language, durationSec, reason });
    return { clipId, status: "accepted" };
  }
}
