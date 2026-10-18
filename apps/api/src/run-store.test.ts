import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { describe, expect, it } from "vitest";
import type { ClearanceCertificate } from "@clearframe/contracts";
import type { RunResult } from "@clearframe/core/agent/run";
import { RUN_TTL_DAYS } from "./run-record";
import { AwsRunStore } from "./run-store";

const result: RunResult = {
  manifest: {
    runId: "11111111-1111-4111-8111-111111111111",
    request: { prompt: "surf", territory: "ES", date: "2026-10-17" },
    catalogVersion: "ae337fe9b6fb3434c13d8a6de17a56298b3b6908599774d835066eac4e17f0bc",
    clips: [],
    rejected: [{ clipId: "clip_0002", reasons: ["LICENSE_EXPIRED"] }],
    stopReason: "error",
    summary: "failed",
    usage: { steps: 1, inputTokens: 100, outputTokens: 10, embeddingTokens: 5 },
    costUsd: 0.00002,
    durationMs: 1200,
  },
  steps: [
    {
      stepNumber: 0,
      toolCalls: ["searchClips"],
      inputTokens: 100,
      outputTokens: 10,
      durationMs: 900,
    },
  ],
  decisions: [],
  model: "claude-haiku-5-5",
  error: { code: "provider_unavailable", message: "APICallError: overloaded" },
};

const createdAt = new Date("2026-10-17T18:30:00.000Z");

const certificate: ClearanceCertificate = {
  v: 1,
  alg: "ES256",
  keyId: "9c8a2f4e-1b3d-4e5f-8a7b-6c5d4e3f2a1b",
  issuedAt: "2026-10-17T18:30:01.000Z",
  runId: result.manifest.runId,
  digests: { manifest: "a".repeat(64), clips: [] },
  signature: "s".repeat(86),
};

const stored = {
  VersionId: "3HL4kqtJlcpXroDTDmJ.rmSpXd3dIbrHY",
  ChecksumSHA256: "n4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is0V1sFbDwCgg=",
};

function recordingStore(response: object = stored) {
  const sent: unknown[] = [];
  const client = {
    send: async (command: unknown) => {
      sent.push(command);
      return command instanceof PutObjectCommand ? response : {};
    },
  };
  const store = new AwsRunStore({
    tableName: "runs",
    bucket: "data-bucket",
    s3: client as never,
    dynamo: client as never,
  });
  return { store, sent };
}

describe("AwsRunStore", () => {
  it("writes the manifest to S3 before the run record to DynamoDB", async () => {
    const { store, sent } = recordingStore();
    await store.save(result, certificate, createdAt, "user-123");
    expect(sent[0]).toBeInstanceOf(PutObjectCommand);
    expect(sent[1]).toBeInstanceOf(PutCommand);
  });

  it("stores a record that points at the manifest and expires after the TTL", async () => {
    const { store, sent } = recordingStore();
    const record = await store.save(result, certificate, createdAt, "user-123");

    expect((sent[0] as PutObjectCommand).input.Key).toBe(
      "manifests/2026-10-17/11111111-1111-4111-8111-111111111111.json",
    );
    expect(record).toMatchObject({
      runId: result.manifest.runId,
      status: "error",
      userId: "user-123",
      errorCode: "provider_unavailable",
      errorMessage: "APICallError: overloaded",
      territory: "ES",
      rejectedCount: 1,
      steps: result.steps,
      inputTokens: 100,
      manifestKey: (sent[0] as PutObjectCommand).input.Key,
      expiresAt: createdAt.getTime() / 1000 + RUN_TTL_DAYS * 86_400,
    });
    expect((sent[1] as PutCommand).input.Item).toEqual(record);
  });

  it("records which version of the manifest the run wrote, and its checksum", async () => {
    const { store, sent } = recordingStore();
    const record = await store.save(result, certificate, createdAt, "user-123");
    expect(record).toMatchObject({
      manifestVersionId: stored.VersionId,
      manifestSha256: stored.ChecksumSHA256,
    });
    expect((sent[1] as PutCommand).input.Item).toMatchObject({
      manifestVersionId: stored.VersionId,
    });
  });

  it("writes no run record when S3 does not say which version it stored", async () => {
    const { store, sent } = recordingStore({});
    await expect(store.save(result, certificate, createdAt, "user-123")).rejects.toThrow(
      "no version",
    );
    expect(sent).toHaveLength(1);
  });

  it("locks the manifest in governance mode until the run record expires", async () => {
    const { store, sent } = recordingStore();
    const record = await store.save(result, certificate, createdAt, "user-123");

    expect((sent[0] as PutObjectCommand).input).toMatchObject({
      ObjectLockMode: "GOVERNANCE",
      ObjectLockRetainUntilDate: new Date(record.expiresAt * 1000),
      ChecksumAlgorithm: "SHA256",
    });
    expect(record.catalogVersion).toBe(result.manifest.catalogVersion);
  });

  it("never overwrites an existing run", async () => {
    const { store, sent } = recordingStore();
    await store.save(result, certificate, createdAt, "user-123");
    expect((sent[1] as PutCommand).input.ConditionExpression).toBe("attribute_not_exists(runId)");
  });

  it("lists a user's runs from the byUser index, newest first, dropping unreadable items", async () => {
    const sent: unknown[] = [];
    const item = {
      runId: result.manifest.runId,
      userId: "user-123",
      createdAt: createdAt.toISOString(),
      prompt: "surf",
      territory: "ES",
      date: "2026-10-17",
      stopReason: "error",
      clipCount: 0,
      rejectedCount: 1,
      costUsd: 0.00002,
    };
    const dynamo = {
      send: async (command: unknown) => {
        sent.push(command);
        return { Items: [item, { runId: "not-a-run" }] };
      },
    };
    const store = new AwsRunStore({
      tableName: "runs",
      bucket: "b",
      s3: dynamo as never,
      dynamo: dynamo as never,
    });
    const runs = await store.listRuns("user-123", 20);
    expect(runs).toHaveLength(1);
    expect((sent[0] as QueryCommand).input).toMatchObject({
      IndexName: "byUser",
      ExpressionAttributeValues: { ":userId": "user-123" },
      ScanIndexForward: false,
      Limit: 20,
    });
  });

  it("reads back the recorded manifest version with checksum validation on", async () => {
    const sent: unknown[] = [];
    let body: unknown = { manifest: result.manifest, certificate };
    const s3 = {
      send: async (command: unknown) => {
        sent.push(command);
        return {
          ChecksumSHA256: stored.ChecksumSHA256,
          Body: { transformToString: async () => JSON.stringify(body) },
        };
      },
    };
    const store = new AwsRunStore({
      tableName: "runs",
      bucket: "b",
      s3: s3 as never,
      dynamo: s3 as never,
    });
    const record = {
      manifestKey: "manifests/k.json",
      manifestVersionId: stored.VersionId,
      manifestSha256: stored.ChecksumSHA256,
    } as never;
    expect(await store.readManifest(record)).toMatchObject({ verified: true, certificate });
    expect((sent[0] as GetObjectCommand).input).toMatchObject({
      Key: "manifests/k.json",
      VersionId: stored.VersionId,
      ChecksumMode: "ENABLED",
    });
    const unverifiable = { manifestKey: "manifests/k.json" } as never;
    expect(await store.readManifest(unverifiable)).toMatchObject({ verified: false });

    body = result.manifest;
    const legacy = await store.readManifest(record);
    expect(legacy).toMatchObject({ manifest: result.manifest });
    expect(legacy).not.toHaveProperty("certificate");
  });

  it("stores the signed envelope, and records which key signed it", async () => {
    const { store, sent } = recordingStore();
    const record = await store.save(result, certificate, createdAt, "user-123");
    const body = JSON.parse(String((sent[0] as PutObjectCommand).input.Body));
    expect(body).toEqual({ manifest: result.manifest, certificate });
    expect(record.signingKeyId).toBe(certificate.keyId);
  });
});
