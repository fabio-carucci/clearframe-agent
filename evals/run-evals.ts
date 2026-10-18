import { mkdir, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";
import { MODEL_ID } from "@clearframe/core/agent/agent";
import type { RunErrorCode } from "@clearframe/core/agent/errors";
import { type RunDeps, runClipAgent } from "@clearframe/core/agent/run";
import { loadCatalogData } from "@clearframe/core/catalog/load";
import { embedQuery } from "@clearframe/core/retrieval/embeddings";
import { EVAL_CASES, type EvalCase } from "./cases";
import { type CaseResult, eligibleClipIds, gateFailures, scoreCase, summarize } from "./metrics";
import { type ReportMeta, renderMarkdown } from "./report";
import { UncheckedManifestDraft } from "./unchecked-draft";

const { values } = parseArgs({
  options: {
    repeat: { type: "string", default: "1" },
    concurrency: { type: "string", default: "4" },
    cases: { type: "string" },
    "no-rule": { type: "boolean", default: false },
    label: { type: "string" },
    "min-recall": { type: "string" },
    "min-precision": { type: "string" },
  },
});

function threshold(flag: "min-recall" | "min-precision"): number | undefined {
  const raw = values[flag];
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!(value >= 0 && value <= 1)) throw new Error(`--${flag} must be between 0 and 1`);
  return value;
}

const thresholds = {
  minRecall: threshold("min-recall"),
  minFilterPrecision: threshold("min-precision"),
};

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

/** Failures on the provider's side say nothing about the agent, so they get a second attempt. */
const RETRYABLE: ReadonlySet<RunErrorCode> = new Set(["rate_limited", "provider_unavailable"]);
const RETRY_DELAY_MS = 10_000;

async function runCase(evalCase: EvalCase): Promise<CaseResult> {
  const first = await attempt(evalCase);
  if (!first.errorCode || !RETRYABLE.has(first.errorCode)) return first.result;
  console.error(`${evalCase.id}: ${first.result.error}; retrying once`);
  await sleep(RETRY_DELAY_MS);
  return { ...(await attempt(evalCase)).result, retried: true };
}

async function attempt(
  evalCase: EvalCase,
): Promise<{ result: CaseResult; errorCode?: RunErrorCode }> {
  const { prompt, territory, date } = evalCase;
  try {
    const { manifest, error } = await runClipAgent({ prompt, territory, date }, deps);
    return {
      result: {
        ...scoreCase(evalCase, manifest, data.clips, data.clipsById),
        ...(error && { error: `${error.code}: ${error.message}` }),
      },
      ...(error && { errorCode: error.code }),
    };
  } catch (error) {
    const result: CaseResult = {
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
    return { result };
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

const failures = ablation ? [] : gateFailures(summary, thresholds);
if (failures.length > 0) {
  console.error(`FAILED: ${failures.join("; ")}`);
  process.exit(1);
}
