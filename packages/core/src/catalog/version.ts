import { createHash } from "node:crypto";
import type { Clip } from "./schema";

/**
 * SHA-256 of the catalog as loaded, licenses included: which catalog a decision was made on. The
 * agent and the notary compute it apart, from separate copies, and must agree.
 */
export const catalogVersion = (clips: readonly Clip[]): string =>
  createHash("sha256").update(JSON.stringify(clips)).digest("hex");
