import type { ClipDecision, ProposalRejection } from "@clearframe/contracts";
import type { Clip } from "../catalog/schema";

type Outcome = ClipDecision["outcome"];

/** Every clip the agent touched during a run, in the order it first touched them. */
export class DecisionLog {
  readonly #clipsById: ReadonlyMap<string, Clip>;
  readonly #decisions = new Map<string, ClipDecision>();

  constructor(clipsById: ReadonlyMap<string, Clip>) {
    this.#clipsById = clipsById;
  }

  record(clipId: string, outcome: Outcome, reasons: ProposalRejection[]): ClipDecision {
    const current = this.#decisions.get(clipId);
    // The rule's verdict is final: a later rights check or a duplicate proposal must not
    // turn an accepted or refused clip back into a pending one.
    if (current && (current.outcome === "accepted" || current.outcome === "refused")) {
      return current;
    }
    const clip = this.#clipsById.get(clipId);
    const decision: ClipDecision = {
      clipId,
      title: clip?.title ?? null,
      genre: clip?.genre ?? null,
      language: clip?.language ?? null,
      durationSec: clip?.durationSec ?? null,
      outcome,
      reasons,
    };
    this.#decisions.set(clipId, decision);
    return decision;
  }

  /** At the end of a run, a clip that was only checked is one the model chose not to propose. */
  final(): ClipDecision[] {
    return [...this.#decisions.values()].map((decision) =>
      decision.outcome === "checked" ? { ...decision, outcome: "not_proposed" } : decision,
    );
  }
}
