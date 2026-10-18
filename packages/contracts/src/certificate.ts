import { canonicalJson } from "./canonical-json";
import { findDuplicateKey } from "./duplicate-keys";
import {
  type ClearanceCertificate,
  ClearanceCertificateSchema,
  type Manifest,
  ManifestSchema,
} from "./index";
import publishedKeys from "./signing-keys.json";

export { canonicalJson };

/** A public key a certificate can name: base64 DER SubjectPublicKeyInfo, as KMS exports it. */
export interface SigningKey {
  keyId: string;
  spki: string;
}

/**
 * The keys Clearframe's notary signs with. They live in the repository, not in anything a deploy
 * writes, so trusting a new key takes a reviewed commit; infra/github refuses to deploy the
 * notary with a key missing from this list. A key stays listed for as long as any certificate it
 * signed may be checked.
 */
export const PUBLISHED_SIGNING_KEYS: readonly SigningKey[] = publishedKeys;

export type CertificateDigests = ClearanceCertificate["digests"];
export type UnsignedCertificate = Omit<ClearanceCertificate, "signature">;

const utf8 = new TextEncoder();

export const toBase64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function sha256Hex(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", utf8.encode(text)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The JSON shape digests are taken over: a manifest as it was written, unknown fields included. */
type JsonManifest = { clips: readonly unknown[] } & Record<string, unknown>;

/**
 * One digest for the manifest without its clips, and one per clip in order, so a verifier can say
 * which clip changed. Taken over the JSON as given: validating it first would drop fields a
 * schema does not know, and an added field would then go unnoticed.
 */
export async function manifestDigests(manifest: JsonManifest): Promise<CertificateDigests> {
  return {
    manifest: await sha256Hex(canonicalJson({ ...manifest, clips: [] })),
    clips: await Promise.all(manifest.clips.map((clip) => sha256Hex(canonicalJson(clip)))),
  };
}

/** Everything a certificate says about a manifest, before it is signed. */
export async function certify(
  manifest: Manifest,
  keyId: string,
  issuedAt: Date,
): Promise<UnsignedCertificate> {
  return {
    v: 1,
    alg: "ES256",
    keyId,
    issuedAt: issuedAt.toISOString(),
    runId: manifest.runId,
    digests: await manifestDigests(manifest),
  };
}

/** The bytes a certificate's signature covers: the certificate without its signature. */
export function signingInput(
  certificate: UnsignedCertificate | ClearanceCertificate,
): Uint8Array<ArrayBuffer> {
  const { signature: _, ...signed } = certificate as ClearanceCertificate;
  return utf8.encode(canonicalJson(signed));
}

/**
 * Checks the certificate was signed by a key the verifier trusts. WebCrypto hashes the input
 * itself, which is what makes this match a KMS ECDSA_SHA_256 signature over its SHA-256 digest.
 */
export async function verifySignature(
  certificate: ClearanceCertificate,
  keys: readonly SigningKey[],
): Promise<"verified" | "unknown_key" | "signature_invalid"> {
  const key = keys.find((candidate) => candidate.keyId === certificate.keyId);
  if (!key) return "unknown_key";

  let signature: Uint8Array<ArrayBuffer>;
  try {
    signature = fromBase64(certificate.signature);
  } catch {
    return "signature_invalid";
  }
  if (signature.length !== 64) return "signature_invalid";

  const publicKey = await crypto.subtle.importKey(
    "spki",
    fromBase64(key.spki),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    publicKey,
    signature,
    signingInput(certificate),
  );
  return valid ? "verified" : "signature_invalid";
}

export interface DigestChanges {
  /** The request or any other field outside the clips changed. */
  manifest: boolean;
  /** Clips were added or removed. */
  clipCount: { signed: number; received: number } | null;
  /** Clips whose content changed, by position, with the id the file now gives them. */
  clips: { index: number; clipId: string | null }[];
}

/** What differs between the signed digests and the received manifest's; null if nothing does. */
export function compareDigests(
  signed: CertificateDigests,
  received: CertificateDigests,
  clipIds: readonly (string | null)[],
): DigestChanges | null {
  const clips: DigestChanges["clips"] = [];
  const shared = Math.min(signed.clips.length, received.clips.length);
  for (let index = 0; index < shared; index++) {
    if (signed.clips[index] !== received.clips[index]) {
      clips.push({ index, clipId: clipIds[index] ?? null });
    }
  }
  const changes: DigestChanges = {
    manifest: signed.manifest !== received.manifest,
    clipCount:
      signed.clips.length === received.clips.length
        ? null
        : { signed: signed.clips.length, received: received.clips.length },
    clips,
  };
  return changes.manifest || changes.clipCount || clips.length > 0 ? changes : null;
}

export type Verification =
  | { status: "valid"; certificate: ClearanceCertificate; manifest: Manifest }
  | { status: "unsigned"; manifest: Manifest }
  | { status: "malformed"; reason: string }
  | { status: "unknown_key"; certificate: ClearanceCertificate }
  | { status: "signature_invalid"; certificate: ClearanceCertificate }
  | { status: "content_changed"; certificate: ClearanceCertificate; changes: DigestChanges };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isJsonManifest = (value: unknown): value is JsonManifest =>
  isRecord(value) && Array.isArray(value.clips);

const ENVELOPE_FIELDS = new Set(["manifest", "certificate"]);

const malformed = (reason: string): Verification => ({ status: "malformed", reason });

/**
 * Verifies a downloaded manifest file, locally: the signature, then every digest. A manifest
 * without a certificate is unsigned, never valid, and nothing in the file may sit outside what
 * the signature covers. Accepts the file's text or its parsed JSON; only text can be checked for
 * repeated keys.
 */
export async function verifySignedManifest(
  file: unknown,
  keys: readonly SigningKey[],
): Promise<Verification> {
  let json = file;
  if (typeof file === "string") {
    try {
      json = JSON.parse(file);
    } catch {
      return malformed("The file is not JSON.");
    }
    const repeated = findDuplicateKey(file);
    if (repeated !== null) {
      return malformed(
        `The file gives "${repeated}" twice in one object, so readers can disagree on its value.`,
      );
    }
  }

  // A file with a manifest member is an envelope; any other object is a bare, unsigned manifest.
  const envelope = isRecord(json) && "manifest" in json ? json : null;
  const rawManifest = envelope ? envelope.manifest : json;
  const manifest = ManifestSchema.safeParse(rawManifest);
  if (!isJsonManifest(rawManifest) || !manifest.success) {
    return malformed("The file is not a Clearframe manifest.");
  }
  if (!envelope) return { status: "unsigned", manifest: manifest.data };

  const unsignedFields = Object.keys(envelope).filter((field) => !ENVELOPE_FIELDS.has(field));
  if (unsignedFields.length > 0) {
    return malformed(
      `The file has fields outside the signed manifest: ${unsignedFields.join(", ")}.`,
    );
  }
  if (envelope.certificate === undefined) return { status: "unsigned", manifest: manifest.data };

  const certificate = ClearanceCertificateSchema.safeParse(envelope.certificate);
  if (!certificate.success) {
    const unknown = certificate.error.issues.flatMap((issue) =>
      issue.code === "unrecognized_keys" ? issue.keys : [],
    );
    return malformed(
      unknown.length > 0
        ? `The certificate has fields its signature does not cover: ${unknown.join(", ")}.`
        : "The certificate is not in the expected format.",
    );
  }

  const signature = await verifySignature(certificate.data, keys);
  if (signature !== "verified") return { status: signature, certificate: certificate.data };

  const changes = compareDigests(
    certificate.data.digests,
    await manifestDigests(rawManifest),
    rawManifest.clips.map((clip) => {
      const clipId = (clip as { clipId?: unknown } | null)?.clipId;
      return typeof clipId === "string" ? clipId : null;
    }),
  );
  if (changes) return { status: "content_changed", certificate: certificate.data, changes };
  return { status: "valid", certificate: certificate.data, manifest: manifest.data };
}
