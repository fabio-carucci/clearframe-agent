import { tool } from "ai";
import { z } from "zod";
import type { RunContext } from "./context";
import { MAX_BATCH } from "./tools";

export const createAddToManifestTool = (run: RunContext) =>
  tool({
    description:
      `Propose up to ${MAX_BATCH} clips for the dataset manifest, each with a one-sentence reason. ` +
      "Every clip is checked against the training rights rule for this request's territory and " +
      "date; only clips that pass are added. Returns one outcome per clip, with the rejection " +
      "reasons when a clip is refused. Do not propose a refused clip again.",
    inputSchema: z.object({
      items: z
        .array(
          z.object({
            clipId: z.string(),
            reason: z.string().min(1).describe("Why this clip fits the request"),
          }),
        )
        .min(1)
        .max(MAX_BATCH),
    }),
    execute: async ({ items }) => {
      run.emit({ type: "proposing", clipIds: items.map((item) => item.clipId) });
      const outcomes = items.map(({ clipId, reason }) => run.draft.propose(clipId, reason));
      run.emit({
        type: "clips",
        decisions: outcomes.map((outcome) =>
          outcome.status === "accepted"
            ? run.decisions.record(outcome.clipId, "accepted", [])
            : run.decisions.record(outcome.clipId, "refused", outcome.reasons),
        ),
      });
      return { outcomes, manifestSize: run.draft.entries.length };
    },
  });
