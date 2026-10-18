import { ComposeRequestSchema } from "@clearframe/contracts";
import { earliestUsageDate } from "@clearframe/core/rights/usage-date";
import { z } from "zod";

export type ParsedRequest =
  | { ok: true; prompt: string; territory: string; date: string }
  | { ok: false; error: string; issues?: unknown };

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
