import { mkdir, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { MODEL_ID } from "../src/agent/agent";
import { type RunDeps, runClipAgent } from "../src/agent/run";
import { loadCatalogData } from "../src/catalog/load";
import { embedQuery } from "../src/retrieval/embeddings";
import { EVAL_CASES, type EvalCase } from "./cases";
import { type CaseResult, eligibleClipIds, scoreCase, summarize } from "./metrics";
import { type ReportMeta, renderMarkdown } from "./report";
import { UncheckedManifestDraft } from "./unchecked-draft";

const { values } = parseArgs({
  options: {
    repeat: { type: "string", default: "1" },
    concurrency: { type: "string", default: "4" },
    cases: { type: "string" },
    "no-rule": { type: "boolean", default: false },
    label: { type: "string" },
  },
});

const repeat = Number(values.repeat);
const concurrency = Number(values.concurrency);
const ablation = values["no-rule"];
const caseIds = values.cases?.split(",");
const selected = caseIds ? EVAL_CASES.filter((c) => caseIds.includes(c.id)) : EVAL_CASES;

const data = await loadCatalogData();
const deps: RunDeps = {
  data,
  embedQuery,
  ...(ablation && {
    createDraft: (catalog, usage) => new UncheckedManifestDraft(catalog.clipsById, usage),
  }),
};

async function runCase(evalCase: EvalCase): Promise<CaseResult> {
  const { prompt, territory, date } = evalCase;
  try {
    const manifest = await runClipAgent({ prompt, territory, date }, deps);
    return scoreCase(evalCase, manifest, data.clips, data.clipsById);
  } catch (error) {
    return {
      caseId: evalCase.id,
      tags: evalCase.tags,
      eligible: eligibleClipIds(evalCase, data.clips).size,
      clips: 0,
      violations: [],
      filterPrecision: null,
      recall: null,
      countRespected: true,
      stopReason: "error",
      steps: 0,
      costUsd: 0,
      durationMs: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const meta: ReportMeta = {
  mode: ablation ? "no-rule" : "with-rule",
  model: MODEL_ID,
  repeat,
  startedAt: new Date().toISOString(),
};
const jobs = selected.flatMap((evalCase) => Array<EvalCase>(repeat).fill(evalCase));
console.error(`Running ${jobs.length} eval runs (${meta.mode}, concurrency ${concurrency})`);

let done = 0;
const results = await mapWithConcurrency(jobs, concurrency, async (evalCase) => {
  const result = await runCase(evalCase);
  console.error(
    `[${++done}/${jobs.length}] ${result.caseId}: ${result.clips} clips, ` +
      `${result.violations.length} violations, ${result.stopReason}`,
  );
  return result;
});

const summary = summarize(results);
const reportDir = new URL("./reports/", import.meta.url);
const reportName = `latest-${meta.mode}${values.label ? `-${values.label}` : ""}`;
await mkdir(reportDir, { recursive: true });
await writeFile(
  new URL(`${reportName}.json`, reportDir),
  `${JSON.stringify({ meta, summary, results }, null, 2)}\n`,
);
const markdown = renderMarkdown(meta, summary, results);
await writeFile(new URL(`${reportName}.md`, reportDir), markdown);
console.log(markdown);

if (!ablation && (summary.violations > 0 || summary.errors > 0)) {
  console.error(`FAILED: ${summary.violations} rights violations, ${summary.errors} errors`);
  process.exit(1);
}
