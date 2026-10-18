import { ComposeRequestSchema } from "@clearframe/contracts";
import { z } from "zod";

export type ParsedRequest =
  | { ok: true; prompt: string; territory: string; date: string }
  | { ok: false; error: string; issues?: unknown };

/** UTC-12 is the last time zone to reach each new day. */
const LAST_ZONE_OFFSET_MS = 12 * 3_600_000;

/**
 * The earliest usage date that is still today somewhere: the date at UTC-12. A day is past only
 * once it is past everywhere; accepting any earlier date would let a license work on, or after,
 * the day it expires.
 */
export const earliestUsageDate = (now: Date) =>
  new Date(now.getTime() - LAST_ZONE_OFFSET_MS).toISOString().slice(0, 10);

/** Validates an API request. The usage date defaults to today in UTC. */
export function parseRunRequest(body: unknown, now: Date): ParsedRequest {
  const parsed = ComposeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: "Invalid request", issues: z.treeifyError(parsed.error) };
  }
  const { prompt, territory, date = now.toISOString().slice(0, 10) } = parsed.data;
  const earliest = earliestUsageDate(now);
  if (date < earliest) {
    return { ok: false, error: `Usage date ${date} is in the past; use ${earliest} or later` };
  }
  return { ok: true, prompt, territory, date };
}
