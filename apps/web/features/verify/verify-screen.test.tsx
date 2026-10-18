// @vitest-environment happy-dom
import type { ClearanceCertificate, Manifest } from "@clearframe/contracts";
import {
  type SigningKey,
  certify,
  signingInput,
  toBase64Url,
} from "@clearframe/contracts/certificate";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { VerificationReport, Verifier } from "./verify-screen";

const clip = (clipId: string) => ({
  clipId,
  title: `Title ${clipId}`,
  genre: "nature_wildlife" as const,
  language: "en" as const,
  durationSec: 30,
  reason: "Fits.",
  license: { trainingAllowed: true, territories: ["ES"], expiresAt: null },
  daysUntilExpiry: null,
  expiresSoon: false,
});

const manifest: Manifest = {
  runId: "11111111-1111-4111-8111-111111111111",
  request: { prompt: "nature in English", territory: "ES", date: "2026-10-18" },
  catalogVersion: "a3f9".padEnd(64, "0"),
  clips: [clip("clip_0133"), clip("clip_0020"), clip("clip_0120")],
  rejected: [],
  stopReason: "completed",
  summary: "Three clips.",
  usage: { steps: 3, inputTokens: 100, outputTokens: 10, embeddingTokens: 1 },
  costUsd: 0.002,
  durationMs: 9000,
};

let keys: SigningKey[];
let certificate: ClearanceCertificate;

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
  keys = [
    { keyId: "9c8a2f4e-1b3d-4e5f-8a7b-6c5d4e3f2a1b", spki: btoa(String.fromCharCode(...spki)) },
  ];
  const unsigned = await certify(manifest, keys[0]!.keyId, new Date("2026-10-18T17:42:00Z"));
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      pair.privateKey,
      signingInput(unsigned),
    ),
  );
  certificate = { ...unsigned, signature: toBase64Url(signature) };
});

afterEach(cleanup);

async function pasteAndVerify(json: unknown, published = true) {
  render(<Verifier keys={keys} keysPublished={published} />);
  fireEvent.change(screen.getByLabelText("Or paste its JSON"), {
    target: { value: JSON.stringify(json) },
  });
  fireEvent.click(screen.getByText("Verify pasted JSON"));
}

describe("/verify", () => {
  it("confirms an untouched signed manifest, with when, which key and how many clips", async () => {
    await pasteAndVerify({ manifest, certificate });
    expect(await screen.findByText("Signed by Clearframe, unchanged since")).toBeTruthy();
    expect(screen.getByText(/18 Oct 2026, 17:42 UTC/)).toBeTruthy();
    expect(screen.getByText(/3 clips intact/)).toBeTruthy();
  });

  it("names the clip that changed after signing", async () => {
    const edited = structuredClone(manifest);
    edited.clips[2]!.license.expiresAt = "2030-01-01";
    await pasteAndVerify({ manifest: edited, certificate });
    expect(await screen.findByText("Changed after signing")).toBeTruthy();
    expect(screen.getByText("clip_0120").closest("li")?.textContent).toBe(
      "Clip 3 (clip_0120) was modified after signing.",
    );
  });

  it("never shows a manifest without a certificate as valid", async () => {
    await pasteAndVerify({ manifest });
    expect(await screen.findByText("Not signed")).toBeTruthy();
    expect(screen.queryByText("Signed by Clearframe, unchanged since")).toBeNull();
  });

  it("says when this environment publishes no keys to check against", () => {
    render(<Verifier keys={[]} keysPublished={false} />);
    expect(screen.getByText(/publishes no signing keys/)).toBeTruthy();
  });

  it("reports a forged signature and a key it does not know", () => {
    render(<VerificationReport result={{ status: "signature_invalid", certificate }} />);
    expect(screen.getByText("The signature is not valid")).toBeTruthy();
    cleanup();
    render(<VerificationReport result={{ status: "unknown_key", certificate }} />);
    expect(screen.getByText("Signed with a key this site does not publish")).toBeTruthy();
  });
});
