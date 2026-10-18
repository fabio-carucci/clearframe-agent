import type { CaseResult, EvalSummary } from "./metrics";

export interface ReportMeta {
  mode: "with-rule" | "no-rule";
  model: string;
  repeat: number;
  startedAt: string;
}

const pct = (value: number | null) => (value === null ? "–" : `${(value * 100).toFixed(1)}%`);
const usd = (value: number | null) => (value === null ? "–" : `$${value.toFixed(5)}`);
const sec = (ms: number | null) => (ms === null ? "–" : `${(ms / 1000).toFixed(1)}s`);

export function renderMarkdown(
  meta: ReportMeta,
  summary: EvalSummary,
  results: readonly CaseResult[],
): string {
  const stopReasons = Object.entries(summary.stopReasons)
    .map(([reason, count]) => `${reason} ${count}`)
    .join(", ");

  const rows = results.map((r) =>
    [
      r.caseId,
      r.tags.join(" "),
      r.eligible,
      r.clips,
      r.violations.length === 0 ? "0" : `**${r.violations.length}** (${r.violations.join(", ")})`,
      pct(r.filterPrecision),
      pct(r.recall),
      r.countRespected ? "yes" : "**no**",
      (r.error ? `error: ${r.error.slice(0, 60)}` : r.stopReason) + (r.retried ? " (retried)" : ""),
      r.steps,
      usd(r.costUsd),
      sec(r.durationMs),
    ].join(" | "),
  );

  return `# Eval report — ${meta.mode}

${meta.startedAt} · model \`${meta.model}\` · ${summary.runs} runs (repeat ${meta.repeat})

| Metric | Value |
|---|---|
| Rights violations | **${summary.violations}** |
| Errors | ${summary.errors} |
| Retried after a provider error | ${summary.retried} |
| Mean filter precision | ${pct(summary.meanFilterPrecision)} |
| Mean recall | ${pct(summary.meanRecall)} |
| Requested count respected | ${pct(summary.countRespectedRate)} |
| Mean cost per request | ${usd(summary.meanCostUsd)} |
| Total cost | ${usd(summary.totalCostUsd)} |
| Mean steps | ${summary.meanSteps?.toFixed(1) ?? "–"} |
| Latency p50 / p95 | ${sec(summary.p50DurationMs)} / ${sec(summary.p95DurationMs)} |
| Stop reasons | ${stopReasons} |

| Case | Tags | Eligible | Clips | Violations | Filter precision | Recall | Count ok | Stop | Steps | Cost | Time |
|---|---|---|---|---|---|---|---|---|---|---|---|
${rows.map((row) => `| ${row} |`).join("\n")}
`;
}
