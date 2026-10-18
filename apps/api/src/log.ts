/**
 * One JSON object per line on stdout. In Lambda each line lands in CloudWatch Logs, where
 * Logs Insights discovers the fields, e.g. `filter event = "step" | stats sum(inputTokens)`.
 */
export function logEvent(event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ event, ...fields, at: new Date().toISOString() }));
}
