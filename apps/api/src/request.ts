import { ComposeRequestSchema } from "@clearframe/contracts";
import { z } from "zod";

export type ParsedRequest =
  | { ok: true; prompt: string; territory: string; date: string }
  | { ok: false; error: string; issues?: unknown };

const DAY_MS = 86_400_000;

/**
 * Validates an API request. The usage date defaults to today (UTC) and may not be in the past,
 * which would make licenses that have since expired look valid. "Past" allows one day of slack:
 * the date is still today somewhere west of UTC until UTC-12 reaches midnight.
 */
export function parseRunRequest(body: unknown, today: string): ParsedRequest {
  const parsed = ComposeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: "Invalid request", issues: z.treeifyError(parsed.error) };
  }
  const { prompt, territory, date = today } = parsed.data;
  const earliest = new Date(Date.parse(today) - DAY_MS).toISOString().slice(0, 10);
  if (date < earliest) {
    return { ok: false, error: `Usage date ${date} is in the past; use ${earliest} or later` };
  }
  return { ok: true, prompt, territory, date };
}
