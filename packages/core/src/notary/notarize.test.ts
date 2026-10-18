import { type Manifest, ManifestSchema } from "@clearframe/contracts";
import { verifySignedManifest } from "@clearframe/contracts/certificate";
import { beforeAll, describe, expect, it } from "vitest";
import { ManifestDraft } from "../agent/manifest";
import type { Clip } from "../catalog/schema";
import { catalogVersion } from "../catalog/version";
import { type ManifestSigner, type NotaryCatalog, notarize } from "./notarize";

const clip = (id: string, license: Partial<Clip["license"]> = {}): Clip => ({
  id,
  title: `Title ${id}`,
  description: "A clip.",
  genre: "cooking",
  language: "es",
  durationSec: 20,
  resolution: "1080p",
  license: { trainingAllowed: true, territories: ["ES"], expiresAt: null, ...license },
});

const clips = [
  clip("clip_0001"),
  clip("clip_0002", { expiresAt: "2026-11-02" }),
  clip("clip_0003", { territories: ["FR"] }),
  clip("clip_0004", { expiresAt: "2026-10-01" }),
];
const catalog: NotaryCatalog = {
  clipsById: new Map(clips.map((c) => [c.id, c])),
  version: catalogVersion(clips),
};
const now = new Date("2026-10-18T09:00:00Z");
const request = { prompt: "Spanish cooking", territory: "ES", date: "2026-10-18" };

/** A manifest as the agent builds it: every clip through ManifestDraft, so through the rule. */
function agentManifest(): Manifest {
  const draft = new ManifestDraft(catalog.clipsById, request);
  draft.propose("clip_0001", "Cooking in Spanish.");
  draft.propose("clip_0002", "Cooking in Spanish.");
  draft.propose("clip_0003", "Licensed elsewhere.");
  draft.propose("clip_9999", "Made up.");
  return ManifestSchema.parse({
    runId: "11111111-1111-4111-8111-111111111111",
    request,
    catalogVersion: catalog.version,
    clips: draft.entries,
    rejected: draft.rejections,
    stopReason: "completed",
    summary: "Two clips.",
    usage: { steps: 2, inputTokens: 100, outputTokens: 10, embeddingTokens: 4 },
    costUsd: 0.0001,
    durationMs: 900,
  });
}

let signer: ManifestSigner;
let keys: { keyId: string; spki: string }[];

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
  keys = [{ keyId: "notary-key", spki: btoa(String.fromCharCode(...spki)) }];
  signer = {
    keyId: "notary-key",
    sign: async (input) =>
      new Uint8Array(
        await crypto.subtle.sign(
          { name: "ECDSA", hash: "SHA-256" },
          pair.privateKey,
          new Uint8Array(input),
        ),
      ),
  };
});

const notarized = (json: unknown) => notarize(json, { catalog, signer, now: () => now });

/** The agent's manifest, edited as code that can call the notary might edit it. */
const tampered = (edit: (manifest: any) => void) => {
  const manifest = structuredClone(agentManifest()) as any;
  edit(manifest);
  return manifest;
};

describe("notarize", () => {
  it("signs a manifest the rule produced, with its own clock, verifiably", async () => {
    const manifest = agentManifest();
    const response = await notarized(manifest);
    if (!("certificate" in response)) throw new Error(JSON.stringify(response));
    expect(response.certificate.issuedAt).toBe(now.toISOString());
    const verification = await verifySignedManifest(
      { manifest, certificate: response.certificate },
      keys,
    );
    expect(verification.status).toBe("valid");
  });

  it.each([
    [
      "a license that is not the catalog's",
      (m: any) => (m.clips[1].license.expiresAt = "2099-01-01"),
    ],
    ["an expiry warning dropped", (m: any) => (m.clips[1].expiresSoon = false)],
    ["a title that is not the catalog's", (m: any) => (m.clips[0].title = "Approved by legal")],
    ["a clip the catalog does not have", (m: any) => (m.clips[0].clipId = "clip_9999")],
    ["the same clip twice", (m: any) => m.clips.push(m.clips[0])],
  ])("refuses %s", async (_case, edit) => {
    expect(await notarized(tampered(edit))).toMatchObject({
      refused: { code: "CLIP_MISMATCH" },
    });
  });

  it("refuses a clip the rule refuses, even with its catalog license copied faithfully", async () => {
    const manifest = tampered((m) => {
      const draft = new ManifestDraft(catalog.clipsById, { territory: "FR", date: m.request.date });
      draft.propose("clip_0003", "Licensed in France.");
      m.clips.push(draft.entries[0]);
    });
    expect(await notarized(manifest)).toMatchObject({
      refused: { code: "RULE_VIOLATION", detail: "clip_0003: TERRITORY_NOT_LICENSED." },
    });
  });

  it("refuses a usage date that is past everywhere, which would revive expired licenses", async () => {
    const manifest = tampered((m) => {
      m.request.date = "2026-09-30";
      m.clips = [];
      m.rejected = [];
    });
    expect(await notarized(manifest)).toMatchObject({ refused: { code: "DATE_IN_PAST" } });
  });

  it("refuses a manifest cleared against another catalog", async () => {
    const manifest = tampered((m) => (m.catalogVersion = "0".repeat(64)));
    expect(await notarized(manifest)).toMatchObject({ refused: { code: "CATALOG_MISMATCH" } });
  });

  it("refuses rejections the rule would not give", async () => {
    const manifest = tampered((m) => (m.rejected[0].reasons = ["LICENSE_EXPIRED"]));
    expect(await notarized(manifest)).toMatchObject({ refused: { code: "REJECTION_MISMATCH" } });
    const allowed = tampered((m) =>
      m.rejected.push({ clipId: "clip_0001", reasons: ["DUPLICATE"] }),
    );
    expect(await notarized(allowed)).toMatchObject({ refused: { code: "REJECTION_MISMATCH" } });
  });

  it("refuses fields the schema does not know, which it would sign unchecked", async () => {
    const manifest = tampered((m) => (m.clips[0].legalApproval = "granted"));
    expect(await notarized(manifest)).toMatchObject({ refused: { code: "MALFORMED" } });
    expect(await notarized({ hello: "world" })).toMatchObject({ refused: { code: "MALFORMED" } });
  });
});
