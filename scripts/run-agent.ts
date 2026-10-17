import { parseArgs } from "node:util";
import { runClipAgent } from "../src/agent/run";
import { loadCatalogData } from "../src/catalog/load";
import { embedQuery } from "../src/retrieval/embeddings";

const USAGE = 'Usage: pnpm agent --territory ES [--date YYYY-MM-DD] "<request>"';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    territory: { type: "string" },
    date: { type: "string", default: new Date().toISOString().slice(0, 10) },
  },
});

const prompt = positionals.join(" ").trim();
if (!values.territory || !prompt) {
  console.error(USAGE);
  process.exit(1);
}

const manifest = await runClipAgent(
  { prompt, territory: values.territory, date: values.date },
  {
    data: await loadCatalogData(),
    embedQuery,
    onStep: (step) =>
      console.error(
        `step ${step.stepNumber}: ${step.toolCalls.join(", ") || "final answer"} ` +
          `(${step.inputTokens} in / ${step.outputTokens} out)`,
      ),
  },
);

console.log(JSON.stringify(manifest, null, 2));
console.error(
  `\n${manifest.clips.length} clips, ${manifest.rejected.length} rejected, ` +
    `stop: ${manifest.stopReason}, cost: $${manifest.costUsd.toFixed(5)}, ` +
    `${(manifest.durationMs / 1000).toFixed(1)}s`,
);
