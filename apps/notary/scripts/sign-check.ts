import { GetPublicKeyCommand, KMSClient } from "@aws-sdk/client-kms";
import type { Manifest } from "@clearframe/contracts";
import { PUBLISHED_SIGNING_KEYS, verifySignedManifest } from "@clearframe/contracts/certificate";
import { signManifest } from "@clearframe/core/notary/notarize";
import { KmsManifestSigner } from "../src/kms-signer";

/**
 * Checks the real key against the published list, with an administrator's AWS profile: KMS's DER
 * signatures, DIGEST signing and WebCrypto verification meet nowhere else before production, and
 * a key missing from signing-keys.json would sign certificates nobody can verify.
 */
const keyArn = process.argv[2];
if (!keyArn) {
  console.error("Usage: pnpm --filter @clearframe/notary sign-check <signing key ARN>");
  process.exit(2);
}

const kms = new KMSClient({ region: keyArn.split(":")[3] });
const signer = new KmsManifestSigner(kms, keyArn);
const { PublicKey } = await kms.send(new GetPublicKeyCommand({ KeyId: keyArn }));
if (!PublicKey) throw new Error("KMS returned no public key");
const spki = Buffer.from(PublicKey).toString("base64");
const published = PUBLISHED_SIGNING_KEYS.some(
  (key) => key.keyId === signer.keyId && key.spki === spki,
);

const clip = (clipId: string) => ({
  clipId,
  title: "Smoke test clip",
  genre: "cooking" as const,
  language: "es" as const,
  durationSec: 20,
  reason: "Smoke test.",
  license: { trainingAllowed: true, territories: ["ES"], expiresAt: "2027-01-01" },
  daysUntilExpiry: 75,
  expiresSoon: false,
});
const manifest: Manifest = {
  runId: crypto.randomUUID(),
  request: { prompt: "smoke test", territory: "ES", date: "2026-10-18" },
  catalogVersion: "0".repeat(64),
  clips: [clip("clip_0001"), clip("clip_0002")],
  rejected: [],
  stopReason: "completed",
  summary: "Smoke test.",
  usage: { steps: 1, inputTokens: 1, outputTokens: 1, embeddingTokens: 0 },
  costUsd: 0,
  durationMs: 1,
};

const certificate = await signManifest(manifest, signer, new Date());
const untouched = await verifySignedManifest(
  JSON.stringify({ manifest, certificate }),
  PUBLISHED_SIGNING_KEYS,
);
const edited = structuredClone(manifest);
edited.clips[1]!.license.expiresAt = "2030-01-01";
const tampered = await verifySignedManifest(
  JSON.stringify({ manifest: edited, certificate }),
  PUBLISHED_SIGNING_KEYS,
);

console.log(`key ${signer.keyId}`);
console.log(`listed in signing-keys.json: ${published} (expected true)`);
console.log(`untouched manifest: ${untouched.status} (expected valid)`);
console.log(`edited licence:     ${tampered.status} (expected content_changed)`);
if (!published || untouched.status !== "valid" || tampered.status !== "content_changed") {
  process.exit(1);
}
