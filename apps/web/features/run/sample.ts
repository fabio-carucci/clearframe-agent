import type { RunEvent } from "@clearframe/contracts";
import recording from "./sample-run.json";

/**
 * A run recorded from the deployed agent's NDJSON stream, opened and replayed by the local
 * preview. JSON imports lose literal types; sample.test.ts checks every event against the schema.
 */
export const SAMPLE_RECORDING = recording as RunEvent[];
