import { InvokeCommand } from "@aws-sdk/client-lambda";
import type { ClearanceCertificate, Manifest } from "@clearframe/contracts";
import { describe, expect, it } from "vitest";
import { LambdaNotary } from "./notary";

const manifest = { runId: "11111111-1111-4111-8111-111111111111" } as Manifest;
const certificate: ClearanceCertificate = {
  v: 1,
  alg: "ES256",
  keyId: "dabca453-4c1f-4eab-9866-53acbe10db10",
  issuedAt: "2026-10-18T10:00:00.000Z",
  runId: manifest.runId,
  digests: { manifest: "a".repeat(64), clips: [] },
  signature: "c2lnbmF0dXJl",
};

function lambdaAnswering(answer: { Payload?: unknown; FunctionError?: string }) {
  const sent: InvokeCommand[] = [];
  const lambda = {
    send: async (command: InvokeCommand) => {
      sent.push(command);
      const Payload =
        answer.Payload === undefined
          ? undefined
          : new TextEncoder().encode(JSON.stringify(answer.Payload));
      return { ...answer, Payload };
    },
  };
  return { notary: new LambdaNotary(lambda as never, "clearframe-notary"), sent };
}

describe("LambdaNotary", () => {
  it("sends the manifest to the notary function and returns its certificate", async () => {
    const { notary, sent } = lambdaAnswering({ Payload: { certificate } });
    expect(await notary.certify(manifest)).toEqual(certificate);
    expect(sent[0]).toBeInstanceOf(InvokeCommand);
    expect(sent[0]!.input.FunctionName).toBe("clearframe-notary");
    expect(JSON.parse(new TextDecoder().decode(sent[0]!.input.Payload as Uint8Array))).toEqual({
      manifest,
    });
  });

  it("throws with the notary's reason when it refuses to sign", async () => {
    const refused = { code: "RULE_VIOLATION", detail: "clip_0003: TERRITORY_NOT_LICENSED." };
    const { notary } = lambdaAnswering({ Payload: { refused } });
    await expect(notary.certify(manifest)).rejects.toThrow("RULE_VIOLATION");
  });

  it("throws when the notary crashes or answers something else", async () => {
    const crashed = lambdaAnswering({ FunctionError: "Unhandled", Payload: { errorMessage: "x" } });
    await expect(crashed.notary.certify(manifest)).rejects.toThrow("Unhandled");
    const odd = lambdaAnswering({ Payload: { certificate: { ...certificate, v: 2 } } });
    await expect(odd.notary.certify(manifest)).rejects.toThrow();
  });
});
