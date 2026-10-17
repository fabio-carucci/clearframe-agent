import { tool } from "ai";
import { z } from "zod";
import { GenreSchema, LanguageSchema } from "../catalog/schema";
import { rankClips } from "../retrieval/search";
import type { RunContext } from "./context";

export const MAX_BATCH = 25;

export const createSearchClipsTool = (run: RunContext) => {
  const { territory, date } = run.draft.usage;
  // Rights-aware retrieval: the model never sees clips it could not use. addToManifest still
  // runs the rule on every proposal, so this filter saves tokens but is not the guarantee.
  const searchable = run.data.clips.filter((clip) => run.draft.assess(clip)?.allowed ?? true);

  return tool({
    description:
      "Semantic search over the clip catalog. Put the scene you want in `query` (what happens, " +
      "where, mood) and hard constraints in the filters. Returns clips ordered by relevance, " +
      "without license information." +
      (run.draft.enforcesRights
        ? ` Results only include clips licensed for training in ${territory} on ${date}.`
        : ""),
    inputSchema: z.object({
      query: z
        .string()
        .min(1)
        .describe("Scene description in English, e.g. 'surfing a big wave at sunset'"),
      language: LanguageSchema.optional().describe("Spoken language, ISO 639-1"),
      genre: GenreSchema.optional(),
      maxDurationSec: z.number().int().positive().optional(),
      limit: z.number().int().min(1).max(MAX_BATCH).default(10),
    }),
    execute: async ({ query, limit, ...filters }) => {
      const { embedding, tokens } = await run.embedQuery(query);
      run.stats.embeddingTokens += tokens;
      return rankClips(embedding, searchable, run.data.index.vectors, filters, limit).map(
        ({ clip, score }) => ({
          clipId: clip.id,
          title: clip.title,
          description: clip.description,
          genre: clip.genre,
          language: clip.language,
          durationSec: clip.durationSec,
          score: Math.round(score * 1000) / 1000,
        }),
      );
    },
  });
};

export const createGetRightsTool = (run: RunContext) =>
  tool({
    description:
      `Return the training license of up to ${MAX_BATCH} clips` +
      (run.draft.enforcesRights
        ? `, with whether it allows training in ${run.draft.usage.territory} on ` +
          `${run.draft.usage.date}. Use it before adding clips to the manifest.`
        : ". Use it before adding clips to the manifest."),
    inputSchema: z.object({
      clipIds: z.array(z.string()).min(1).max(MAX_BATCH),
    }),
    execute: async ({ clipIds }) =>
      clipIds.map((clipId) => {
        const clip = run.data.clipsById.get(clipId);
        if (!clip) return { clipId, error: "UNKNOWN_CLIP" as const };
        const decision = run.draft.assess(clip);
        if (!decision) return { clipId, license: clip.license };
        return {
          clipId,
          license: clip.license,
          eligible: decision.allowed,
          ...(decision.allowed ? {} : { reasons: decision.reasons }),
        };
      }),
  });
