import { createHash } from "node:crypto";
import { type KMSClient, SignCommand } from "@aws-sdk/client-kms";
import type { ClearanceCertificate, Manifest } from "@clearframe/contracts";
import { certify, signingInput, toBase64Url } from "@clearframe/contracts/certificate";

export interface ManifestSigner {
  readonly keyId: string;
  /** An ECDSA P-256 / SHA-256 signature over `input`, raw r‖s, 64 bytes. */
  sign(input: Uint8Array): Promise<Uint8Array>;
}

const P256_SCALAR_BYTES = 32;

/**
 * KMS returns ECDSA signatures in DER: SEQUENCE { INTEGER r, INTEGER s }. WebCrypto verifies the
 * raw form, r and s as 32 bytes each. DER writes each integer in as few bytes as it can, plus a
 * leading 0x00 when its top bit is set, so either may be 33 bytes or shorter than 32.
 */
export function derToRaw(der: Uint8Array): Uint8Array {
  const malformed = (why: string): never => {
    throw new Error(`Malformed DER signature: ${why}`);
  };
  // A P-256 signature is at most 72 bytes, so every length fits the one-byte short form.
  if (der[0] !== 0x30) malformed("not a sequence");
  if (der[1] !== der.length - 2) malformed("sequence length does not match");

  const raw = new Uint8Array(2 * P256_SCALAR_BYTES);
  let offset = 2;
  for (const start of [0, P256_SCALAR_BYTES]) {
    if (der[offset] !== 0x02) malformed("expected an integer");
    const length = der[offset + 1] ?? 0;
    let integer = der.subarray(offset + 2, offset + 2 + length);
    if (length === 0 || integer.length !== length) malformed("integer length does not match");
    while (integer.length > P256_SCALAR_BYTES && integer[0] === 0) integer = integer.subarray(1);
    if (integer.length > P256_SCALAR_BYTES) malformed("integer longer than 32 bytes");
    raw.set(integer, start + P256_SCALAR_BYTES - integer.length);
    offset += 2 + length;
  }
  if (offset !== der.length) malformed("trailing bytes");
  return raw;
}

/** The key's UUID, which certificates name: the ARN would also name the AWS account. */
export function keyIdFromArn(arn: string): string {
  const keyId = /^arn:aws:kms:[a-z0-9-]+:\d{12}:key\/([0-9a-f-]{36})$/.exec(arn)?.[1];
  if (!keyId) throw new Error(`Not a KMS key ARN: ${arn}`);
  return keyId;
}

export class KmsManifestSigner implements ManifestSigner {
  readonly keyId: string;

  constructor(
    private readonly kms: Pick<KMSClient, "send">,
    private readonly keyArn: string,
  ) {
    this.keyId = keyIdFromArn(keyArn);
  }

  async sign(input: Uint8Array): Promise<Uint8Array> {
    // KMS signs at most 4096 bytes in RAW mode; a SHA-256 digest with DIGEST fits any manifest,
    // and verifies the same as ECDSA_SHA_256 over the input itself.
    const digest = createHash("sha256").update(input).digest();
    const { Signature } = await this.kms.send(
      new SignCommand({
        KeyId: this.keyArn,
        Message: digest,
        MessageType: "DIGEST",
        SigningAlgorithm: "ECDSA_SHA_256",
      }),
    );
    if (!Signature) throw new Error("KMS returned no signature");
    return derToRaw(Signature);
  }
}

/** The manifest's clearance certificate, signed now. */
export async function signManifest(
  manifest: Manifest,
  signer: ManifestSigner,
  issuedAt: Date,
): Promise<ClearanceCertificate> {
  const unsigned = await certify(manifest, signer.keyId, issuedAt);
  return { ...unsigned, signature: toBase64Url(await signer.sign(signingInput(unsigned))) };
}
