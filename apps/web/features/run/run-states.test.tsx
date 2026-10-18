// @vitest-environment happy-dom
import type { ClipDecision, ComposeResponse } from "@clearframe/contracts";
import { certify, signingInput, toBase64Url } from "@clearframe/contracts/certificate";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ClipBin } from "./clip-bin";
import { ClipDetails } from "./clip-details";
import { type LiveRun, applyEvent, binClips, finishedRun, startRun } from "./live-run";
import { RunSummary } from "./run-summary";

const request = { prompt: "5 nature clips in English", territory: "ES", date: "2026-10-18" };
const runId = "11111111-1111-4111-8111-111111111111";

const accepted: ClipDecision = {
  clipId: "clip_0001",
  title: "Wolves in snow",
  genre: "nature_wildlife",
  language: "en",
  durationSec: 30,
  outcome: "accepted",
  reasons: [],
};

const result: ComposeResponse = {
  manifest: {
    runId,
    request,
    catalogVersion: "0".repeat(64),
    clips: [
      {
        clipId: "clip_0001",
        title: "Wolves in snow",
        genre: "nature_wildlife",
        language: "en",
        durationSec: 30,
        reason: "Wolves in snow, in English.",
        license: { trainingAllowed: true, territories: ["ES"], expiresAt: null },
        daysUntilExpiry: null,
        expiresSoon: false,
      },
    ],
    rejected: [],
    stopReason: "step_limit",
    summary: "Stopped early.",
    usage: { steps: 15, inputTokens: 1000, outputTokens: 100, embeddingTokens: 5 },
    costUsd: 0.001,
    durationMs: 9000,
  },
  steps: [],
  decisions: [accepted],
};

const live = (): LiveRun =>
  [
    { type: "started" as const, runId, request },
    { type: "clips" as const, decisions: [accepted] },
  ].reduce(applyEvent, startRun(request, 0));

function showBin(run: LiveRun) {
  render(<ClipBin run={run} clips={binClips(run)} selectedId={null} onSelect={() => {}} />);
}

afterEach(cleanup);

describe("a run as the user sees it", () => {
  it("never calls a clip cleared when the run was not recorded", () => {
    const run = applyEvent(live(), { type: "failed", error: "The run could not be recorded." });
    showBin(run);
    expect(screen.queryByText("Cleared")).toBeNull();
    expect(screen.getByText("Not recorded")).toBeTruthy();
    expect(screen.getByText(/no manifest was issued/)).toBeTruthy();

    render(<ClipDetails clip={binClips(run)[0]!} request={request} />);
    expect(screen.queryByText(/Cleared for training/)).toBeNull();
    expect(screen.getByText(/the run was not recorded, so no manifest includes it/)).toBeTruthy();
  });

  it("marks a clip accepted, not cleared, while the run is still being recorded", () => {
    showBin(live());
    expect(screen.queryByText("Cleared")).toBeNull();
    expect(screen.getByText("Accepted")).toBeTruthy();
    expect(screen.getByText(/1 accepted/)).toBeTruthy();
  });

  it("calls a clip cleared once the run is recorded", () => {
    showBin(applyEvent(live(), { type: "completed", result }));
    expect(screen.getByText("Cleared")).toBeTruthy();
    expect(screen.getByText(/1 cleared/)).toBeTruthy();
  });

  it("says a run that hit the step limit is partial", () => {
    render(<RunSummary run={applyEvent(live(), { type: "completed", result })} />);
    expect(screen.getByText(/Stopped at the step limit: the dataset is partial/)).toBeTruthy();
  });

  it("keeps the run id in view when the run failed, so it can be looked up", () => {
    render(<RunSummary run={applyEvent(live(), { type: "failed", error: "Connection lost." })} />);
    expect(screen.getByText(runId)).toBeTruthy();
    expect(screen.getByText(/Quote this id/)).toBeTruthy();
  });

  it("says whether a run opened from the history matched its recorded checksum", () => {
    const audit = {
      manifestVersionId: "3HL4kqtJlcpXroDTDmJ",
      manifestSha256: "abc=",
      verified: true,
    };
    render(<RunSummary run={finishedRun(result, 0, audit)} />);
    expect(screen.getByText(/matches the SHA-256 recorded with the run/)).toBeTruthy();
    cleanup();

    render(<RunSummary run={finishedRun(result, 0, { ...audit, verified: false })} />);
    expect(screen.getByText(/cannot be verified/)).toBeTruthy();
  });

  it("shows a signature as verified only once this browser has verified it", async () => {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
      "sign",
      "verify",
    ]);
    const spki = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
    const keys = [{ keyId: "9c8a2f4e", spki: btoa(String.fromCharCode(...spki)) }];
    const unsigned = await certify(result.manifest, "9c8a2f4e", new Date("2026-10-18T17:42:00Z"));
    const signature = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      pair.privateKey,
      signingInput(unsigned),
    );
    const certificate = { ...unsigned, signature: toBase64Url(new Uint8Array(signature)) };
    const signed = finishedRun({ ...result, certificate }, 0);

    render(<RunSummary run={signed} signingKeys={keys} />);
    expect(await screen.findByText(/verified in this browser/)).toBeTruthy();
    expect(screen.getByText("verify it").getAttribute("href")).toBe("/verify");
    expect(screen.getByText("Download signed manifest")).toBeTruthy();
    cleanup();

    render(<RunSummary run={signed} signingKeys={[]} />);
    expect(await screen.findByText(/does not publish/)).toBeTruthy();
    expect(screen.queryByText(/verified in this browser/)).toBeNull();
    cleanup();

    render(<RunSummary run={finishedRun(result, 0)} />);
    expect(screen.getByText(/Not signed/)).toBeTruthy();
  });
});
