import {
  type ClearanceCertificate,
  ClearanceCertificateSchema,
  type Manifest,
  ManifestSchema,
  type ProposalRejection,
} from "@clearframe/contracts";
import {
  canonicalJson,
  certify,
  signingInput,
  toBase64Url,
} from "@clearframe/contracts/certificate";
import { z } from "zod";
import { toManifestEntry } from "../agent/manifest";
import type { Clip } from "../catalog/schema";
import { checkTrainingRights } from "../rights/check-training-rights";
import { earliestUsageDate } from "../rights/usage-date";

export interface ManifestSigner {
  readonly keyId: string;
  /** An ECDSA P-256 / SHA-256 signature over `input`, raw r‖s, 64 bytes. */
  sign(input: Uint8Array): Promise<Uint8Array>;
}

/** The catalog the notary checks against: its own copy, not the one the agent read. */
export interface NotaryCatalog {
  clipsById: ReadonlyMap<string, Clip>;
  version: string;
}

export const NOTARY_REFUSALS = [
  "MALFORMED",
  "CATALOG_MISMATCH",
  "DATE_IN_PAST",
  "CLIP_MISMATCH",
  "RULE_VIOLATION",
  "REJECTION_MISMATCH",
] as const;

export type NotaryRefusal = { code: (typeof NOTARY_REFUSALS)[number]; detail: string };

/** What the notary Lambda answers the agent: a certificate, or why it refused to sign. */
export const NotaryResponseSchema = z.union([
  z.object({ certificate: ClearanceCertificateSchema }),
  z.object({ refused: z.object({ code: z.enum(NOTARY_REFUSALS), detail: z.string() }) }),
]);

export type NotaryResponse = z.infer<typeof NotaryResponseSchema>;

/** The manifest's clearance certificate, signed now. */
export async function signManifest(
  manifest: Manifest,
  signer: ManifestSigner,
  issuedAt: Date,
): Promise<ClearanceCertificate> {
  const unsigned = await certify(manifest, signer.keyId, issuedAt);
  return { ...unsigned, signature: toBase64Url(await signer.sign(signingInput(unsigned))) };
}

const refuse = (code: NotaryRefusal["code"], detail: string): NotaryRefusal => ({ code, detail });

/**
 * Why the notary must not sign this manifest, or null when it may. Clips, rejections, the catalog
 * version and the usage date are checked against the notary's own catalog and clock, so code that
 * can call the notary still cannot get a manifest signed that the rule would refuse, or that
 * misstates a license. Text and run statistics (steps, tokens, cost, time) are signed as given.
 */
export function auditManifest(json: unknown, catalog: NotaryCatalog, now: Date) {
  const parsed = ManifestSchema.safeParse(json);
  if (!parsed.success) return refuse("MALFORMED", "Not a manifest.");
  // The digests cover the JSON as given; a field the schema drops would be signed unchecked.
  if (canonicalJson(parsed.data) !== canonicalJson(json)) {
    return refuse("MALFORMED", "The manifest has fields the schema does not know.");
  }
  const { request, clips, rejected, catalogVersion } = parsed.data;

  if (catalogVersion !== catalog.version) {
    return refuse("CATALOG_MISMATCH", `Manifest ${catalogVersion}, notary ${catalog.version}.`);
  }
  const earliest = earliestUsageDate(now);
  if (request.date < earliest) {
    return refuse("DATE_IN_PAST", `Usage date ${request.date} is before ${earliest}.`);
  }

  const seen = new Set<string>();
  for (const entry of clips) {
    const clip = catalog.clipsById.get(entry.clipId);
    if (!clip || seen.has(entry.clipId)) {
      return refuse("CLIP_MISMATCH", `${entry.clipId} is not in the catalog, or appears twice.`);
    }
    seen.add(entry.clipId);
    const decision = checkTrainingRights(clip.license, request);
    if (!decision.allowed) {
      return refuse("RULE_VIOLATION", `${entry.clipId}: ${decision.reasons.join(", ")}.`);
    }
    if (canonicalJson(entry) !== canonicalJson(toManifestEntry(clip, request, entry.reason))) {
      return refuse("CLIP_MISMATCH", `${entry.clipId} does not match the catalog.`);
    }
  }

  for (const { clipId, reasons } of rejected) {
    const clip = catalog.clipsById.get(clipId);
    const decision = clip ? checkTrainingRights(clip.license, request) : null;
    const expected: ProposalRejection[] = !decision
      ? ["UNKNOWN_CLIP"]
      : decision.allowed
        ? []
        : decision.reasons;
    if (canonicalJson(reasons) !== canonicalJson(expected)) {
      return refuse("REJECTION_MISMATCH", `${clipId}: the rule gives [${expected.join(", ")}].`);
    }
  }
  return null;
}

/** Signs the manifest if it passes the audit, with the notary's clock as the issue time. */
export async function notarize(
  json: unknown,
  deps: { catalog: NotaryCatalog; signer: ManifestSigner; now: () => Date },
): Promise<NotaryResponse> {
  const now = deps.now();
  const refusal = auditManifest(json, deps.catalog, now);
  if (refusal) return { refused: refusal };
  return { certificate: await signManifest(ManifestSchema.parse(json), deps.signer, now) };
}
