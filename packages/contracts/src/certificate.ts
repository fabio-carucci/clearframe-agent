import { canonicalJson } from "./canonical-json";
import {
  type ClearanceCertificate,
  ClearanceCertificateSchema,
  type Manifest,
  ManifestSchema,
} from "./index";

export { canonicalJson };

/** A public key a certificate can name: base64 DER SubjectPublicKeyInfo, as KMS exports it. */
export interface SigningKey {
  keyId: string;
  spki: string;
}

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

const isJsonManifest = (value: unknown): value is JsonManifest =>
  typeof value === "object" &&
  value !== null &&
  Array.isArray((value as { clips?: unknown }).clips);

/**
 * Verifies a downloaded manifest file, locally: the signature, then every digest. A manifest
 * without a certificate is unsigned, never valid. Accepts the file's text or its parsed JSON.
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
      return { status: "malformed", reason: "The file is not JSON." };
    }
  }

  const envelope = (json ?? {}) as { manifest?: unknown; certificate?: unknown };
  const rawManifest = isJsonManifest(envelope.manifest) ? envelope.manifest : json;
  const manifest = ManifestSchema.safeParse(rawManifest);
  if (!isJsonManifest(rawManifest) || !manifest.success) {
    return { status: "malformed", reason: "The file is not a Clearframe manifest." };
  }
  if (envelope.certificate === undefined) return { status: "unsigned", manifest: manifest.data };

  const certificate = ClearanceCertificateSchema.safeParse(envelope.certificate);
  if (!certificate.success) {
    return { status: "malformed", reason: "The certificate is not in the expected format." };
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
