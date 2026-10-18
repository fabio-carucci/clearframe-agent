import { parseArgs } from "node:util";
import type { RunEvent } from "@clearframe/contracts";
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

function describe(event: RunEvent): string | null {
  switch (event.type) {
    case "searching":
      return `searching "${event.query}" ${JSON.stringify(event.filters)}`;
    case "checking_rights":
      return `checking rights of ${event.clipIds.length} clips`;
    case "proposing":
      return `proposing ${event.clipIds.length} clips`;
    case "clips":
      return (
        event.decisions
          .filter((d) => d.outcome === "accepted" || d.outcome === "refused")
          .map(
            (d) =>
              `  ${d.outcome} ${d.clipId}${d.reasons.length ? ` (${d.reasons.join(", ")})` : ""}`,
          )
          .join("\n") || null
      );
    case "step":
      return `step ${event.step.stepNumber}: ${event.step.toolCalls.join(", ") || "final answer"} (${event.step.inputTokens} in / ${event.step.outputTokens} out)`;
    default:
      return null;
  }
}

const { manifest } = await runClipAgent(
  { prompt, territory: values.territory, date: values.date },
  {
    data: await loadCatalogData(),
    embedQuery,
    onEvent: (event) => {
      const line = describe(event);
      if (line) console.error(line);
    },
  },
);

console.log(JSON.stringify(manifest, null, 2));
console.error(
  `\n${manifest.clips.length} clips, ${manifest.rejected.length} rejected, ` +
    `stop: ${manifest.stopReason}, cost: $${manifest.costUsd.toFixed(5)}, ` +
    `${(manifest.durationMs / 1000).toFixed(1)}s`,
);
