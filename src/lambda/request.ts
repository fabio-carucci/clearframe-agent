import { z } from "zod";
import { IsoDateSchema, TerritorySchema } from "../catalog/schema";

const RequestBodySchema = z.object({
  prompt: z.string().min(1).max(2000),
  territory: TerritorySchema,
  date: IsoDateSchema.optional(),
});

export type ParsedRequest =
  | { ok: true; prompt: string; territory: string; date: string }
  | { ok: false; error: string; issues?: unknown };

/**
 * Validates an API request. The usage date defaults to today and may not be in the past:
 * a past date would make licenses that have since expired look valid.
 */
export function parseRunRequest(body: unknown, today: string): ParsedRequest {
  const parsed = RequestBodySchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: "Invalid request", issues: z.treeifyError(parsed.error) };
  }
  const { prompt, territory, date = today } = parsed.data;
  if (date < today) {
    return { ok: false, error: `Usage date ${date} is in the past; use ${today} or later` };
  }
  return { ok: true, prompt, territory, date };
}
