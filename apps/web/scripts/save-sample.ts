import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { RunEventSchema } from "@clearframe/contracts";
import { PUBLISHED_SIGNING_KEYS, verifySignedManifest } from "@clearframe/contracts/certificate";

/**
 * Saves a stream recorded from the deployed API (curl with accept: application/x-ndjson) as
 * features/run/sample-run.json, unchanged. Refuses a recording the contract rejects, one that
 * does not end with a result, and one whose manifest does not verify with the published keys.
 */
const file = process.argv[2];
if (!file) {
  console.error("Usage: pnpm --filter @clearframe/web sample:save <recording.ndjson>");
  process.exit(2);
}

const path = resolve(process.env.INIT_CWD ?? process.cwd(), file);
const lines = (await readFile(path, "utf8")).split("\n").filter((line) => line.trim() !== "");
const events = lines.map((line, index) => {
  const event: unknown = JSON.parse(line);
  const parsed = RunEventSchema.safeParse(event);
  if (!parsed.success) throw new Error(`Line ${index + 1} is not a run event: ${parsed.error}`);
  return { event, parsed: parsed.data };
});

const last = events.at(-1);
if (last?.parsed.type !== "completed") {
  throw new Error(`The recording ends with ${last?.parsed.type ?? "nothing"}, not completed`);
}
const { result } = last.event as { result: { manifest: unknown; certificate?: unknown } };
const check = await verifySignedManifest(
  { manifest: result.manifest, certificate: result.certificate },
  PUBLISHED_SIGNING_KEYS,
);
if (check.status !== "valid")
  throw new Error(`The recorded manifest does not verify: ${check.status}`);

const target = new URL("../features/run/sample-run.json", import.meta.url);
await writeFile(
  target,
  `${JSON.stringify(
    events.map(({ event }) => event),
    null,
    2,
  )}\n`,
);
console.log(
  `Saved ${events.length} events of run ${check.certificate.runId}, signed ${check.certificate.issuedAt}`,
);
