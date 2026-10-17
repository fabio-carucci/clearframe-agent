import { PutObjectCommand } from "@aws-sdk/client-s3";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { describe, expect, it } from "vitest";
import type { RunResult } from "../agent/run";
import { RUN_TTL_DAYS } from "./run-record";
import { AwsRunStore } from "./run-store";

const result: RunResult = {
  manifest: {
    runId: "11111111-1111-4111-8111-111111111111",
    request: { prompt: "surf", territory: "ES", date: "2026-10-17" },
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
  error: "provider overloaded",
};

const createdAt = new Date("2026-10-17T18:30:00.000Z");

function recordingStore() {
  const sent: unknown[] = [];
  const client = { send: async (command: unknown) => void sent.push(command) };
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
    await store.save(result, createdAt);
    expect(sent[0]).toBeInstanceOf(PutObjectCommand);
    expect(sent[1]).toBeInstanceOf(PutCommand);
  });

  it("stores a record that points at the manifest and expires after the TTL", async () => {
    const { store, sent } = recordingStore();
    const record = await store.save(result, createdAt);

    expect((sent[0] as PutObjectCommand).input.Key).toBe(
      "manifests/2026-10-17/11111111-1111-4111-8111-111111111111.json",
    );
    expect(record).toMatchObject({
      runId: result.manifest.runId,
      day: "2026-10-17",
      status: "error",
      error: "provider overloaded",
      territory: "ES",
      rejectedCount: 1,
      steps: result.steps,
      inputTokens: 100,
      manifestKey: (sent[0] as PutObjectCommand).input.Key,
      expiresAt: createdAt.getTime() / 1000 + RUN_TTL_DAYS * 86_400,
    });
    expect((sent[1] as PutCommand).input.Item).toEqual(record);
  });

  it("never overwrites an existing run", async () => {
    const { store, sent } = recordingStore();
    await store.save(result, createdAt);
    expect((sent[1] as PutCommand).input.ConditionExpression).toBe("attribute_not_exists(runId)");
  });
});
