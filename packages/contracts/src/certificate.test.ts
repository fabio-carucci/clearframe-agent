import { beforeAll, describe, expect, it } from "vitest";
import {
  PUBLISHED_SIGNING_KEYS,
  type SigningKey,
  certify,
  signingInput,
  toBase64Url,
  verifySignedManifest,
} from "./certificate";
import type { ClearanceCertificate, Manifest } from "./index";

const clip = (clipId: string, expiresAt: string | null) => ({
  clipId,
  title: `Title ${clipId}`,
  genre: "nature_wildlife" as const,
  language: "en" as const,
  durationSec: 30,
  reason: "Fits the request.",
  license: { trainingAllowed: true, territories: ["ES"], expiresAt },
  daysUntilExpiry: expiresAt ? 16 : null,
  expiresSoon: expiresAt !== null,
});

const manifest: Manifest = {
  runId: "11111111-1111-4111-8111-111111111111",
  request: { prompt: "nature in English", territory: "ES", date: "2026-10-17" },
  catalogVersion: "a3f9".padEnd(64, "0"),
  clips: [clip("clip_0133", null), clip("clip_0020", "2026-11-02"), clip("clip_0120", null)],
  rejected: [],
  stopReason: "completed",
  summary: "Three clips.",
  usage: { steps: 3, inputTokens: 12000, outputTokens: 900, embeddingTokens: 12 },
  costUsd: 0.002162,
  durationMs: 8800,
};

let keys: SigningKey[];
let envelope: { manifest: Manifest; certificate: ClearanceCertificate };

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
  keys = [{ keyId: "key-1", spki: btoa(String.fromCharCode(...spki)) }];
  const unsigned = await certify(manifest, "key-1", new Date("2026-10-17T18:00:00Z"));
  // WebCrypto signs ECDSA in the raw r‖s form the certificate carries.
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      pair.privateKey,
      signingInput(unsigned),
    ),
  );
  envelope = { manifest, certificate: { ...unsigned, signature: toBase64Url(signature) } };
});

/** The envelope as a downloaded file would hold it, edited before it is read back. */
const edited = (edit: (file: { manifest: any; certificate: any }) => void) => {
  const file = JSON.parse(JSON.stringify(envelope));
  edit(file);
  return JSON.stringify(file);
};

describe("verifySignedManifest", () => {
  it("accepts an untouched signed manifest, from its text", async () => {
    const result = await verifySignedManifest(JSON.stringify(envelope), keys);
    expect(result).toMatchObject({ status: "valid", certificate: { keyId: "key-1" } });
  });

  it("does not depend on the order of keys in the file", async () => {
    const reordered = JSON.stringify({
      certificate: envelope.certificate,
      manifest: Object.fromEntries(Object.entries(envelope.manifest).reverse()),
    });
    expect((await verifySignedManifest(reordered, keys)).status).toBe("valid");
  });

  it("names the clip whose license was edited after signing", async () => {
    const file = edited((f) => (f.manifest.clips[2].license.expiresAt = "2030-01-01"));
    expect(await verifySignedManifest(file, keys)).toMatchObject({
      status: "content_changed",
      changes: { manifest: false, clipCount: null, clips: [{ index: 2, clipId: "clip_0120" }] },
    });
  });

  it("catches a field added to a clip, which a schema would silently drop", async () => {
    const file = edited((f) => (f.manifest.clips[0].legalApproval = "granted"));
    expect(await verifySignedManifest(file, keys)).toMatchObject({
      status: "content_changed",
      changes: { clips: [{ index: 0, clipId: "clip_0133" }] },
    });
  });

  it("reports a changed request outside the clips", async () => {
    const file = edited((f) => (f.manifest.request.territory = "US"));
    expect(await verifySignedManifest(file, keys)).toMatchObject({
      status: "content_changed",
      changes: { manifest: true, clips: [] },
    });
  });

  it("reports clips added or removed", async () => {
    const removed = edited((f) => f.manifest.clips.pop());
    expect(await verifySignedManifest(removed, keys)).toMatchObject({
      changes: { clipCount: { signed: 3, received: 2 } },
    });
    const added = edited((f) => f.manifest.clips.push(clip("clip_0999", null)));
    expect(await verifySignedManifest(added, keys)).toMatchObject({
      changes: { clipCount: { signed: 3, received: 4 } },
    });
  });

  it("rejects a certificate edited after signing", async () => {
    const file = edited((f) => (f.certificate.issuedAt = "2026-10-16T18:00:00.000Z"));
    expect((await verifySignedManifest(file, keys)).status).toBe("signature_invalid");
  });

  it("rejects a signature with one character changed", async () => {
    const file = edited((f) => {
      const s: string = f.certificate.signature;
      f.certificate.signature = (s[0] === "A" ? "B" : "A") + s.slice(1);
    });
    expect((await verifySignedManifest(file, keys)).status).toBe("signature_invalid");
  });

  it("cannot vouch for a certificate from a key it does not know", async () => {
    const file = edited((f) => (f.certificate.keyId = "key-2"));
    expect((await verifySignedManifest(file, keys)).status).toBe("unknown_key");
  });

  it("calls a manifest without a certificate unsigned, never valid", async () => {
    expect((await verifySignedManifest({ manifest }, keys)).status).toBe("unsigned");
    expect((await verifySignedManifest(manifest, keys)).status).toBe("unsigned");
  });

  it("refuses a file that gives a key twice, whichever value a reader would see", async () => {
    // JSON.parse keeps the last value, the signed one; the first is what a person may read.
    const file = JSON.stringify(envelope).replace(
      '"expiresAt":"2026-11-02"',
      '"expiresAt":"2031-12-31","expiresAt":"2026-11-02"',
    );
    expect(await verifySignedManifest(file, keys)).toMatchObject({
      status: "malformed",
      reason: expect.stringContaining('"expiresAt" twice'),
    });
  });

  it("refuses fields the signature does not cover, in the certificate or beside it", async () => {
    const inCertificate = edited((f) => (f.certificate.approvedBy = "EU AI Office"));
    expect(await verifySignedManifest(inCertificate, keys)).toMatchObject({
      status: "malformed",
      reason: expect.stringContaining("approvedBy"),
    });
    const inDigests = edited((f) => (f.certificate.digests.note = "ok"));
    expect((await verifySignedManifest(inDigests, keys)).status).toBe("malformed");
    const inEnvelope = edited((f) => Object.assign(f, { legalNote: "Cleared by counsel" }));
    expect(await verifySignedManifest(inEnvelope, keys)).toMatchObject({
      status: "malformed",
      reason: expect.stringContaining("legalNote"),
    });
  });

  it("verifies the manifest, not the file's bytes: equal JSON values sign the same", async () => {
    const file = JSON.stringify(envelope).replace('"durationSec":30', '"durationSec":3.0e1');
    expect((await verifySignedManifest(file, keys)).status).toBe("valid");
  });

  it("calls anything else malformed", async () => {
    expect((await verifySignedManifest("{ not json", keys)).status).toBe("malformed");
    expect((await verifySignedManifest({ hello: "world" }, keys)).status).toBe("malformed");
    const badCertificate = edited((f) => (f.certificate.v = 2));
    expect((await verifySignedManifest(badCertificate, keys)).status).toBe("malformed");
  });
});

describe("PUBLISHED_SIGNING_KEYS", () => {
  it("lists distinct P-256 public keys that WebCrypto can import", async () => {
    const ids = PUBLISHED_SIGNING_KEYS.map((key) => key.keyId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const key of PUBLISHED_SIGNING_KEYS) {
      const der = Uint8Array.from(atob(key.spki), (char) => char.charCodeAt(0));
      await expect(
        crypto.subtle.importKey("spki", der, { name: "ECDSA", namedCurve: "P-256" }, false, [
          "verify",
        ]),
      ).resolves.toBeDefined();
    }
  });
});
