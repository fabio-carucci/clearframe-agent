import { GetObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import {
  type DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  type Manifest,
  ManifestSchema,
  type RunSummary,
  RunSummarySchema,
} from "@clearframe/contracts";
import type { RunResult } from "@clearframe/core/agent/run";
import {
  RUNS_BY_USER_INDEX,
  type RunRecord,
  type StoredRunRecord,
  toRunRecord,
} from "./run-record";

export interface RunStore {
  save(result: RunResult, createdAt: Date, userId: string): Promise<RunRecord>;
}

export interface RunHistory {
  listRuns(userId: string, limit: number): Promise<RunSummary[]>;
  findRun(runId: string): Promise<StoredRunRecord | null>;
  /** The manifest version the run wrote; null if it is in a format this code no longer reads. */
  readManifest(record: StoredRunRecord): Promise<{ manifest: Manifest; verified: boolean } | null>;
}

export interface AwsRunStoreConfig {
  tableName: string;
  bucket: string;
  s3: Pick<S3Client, "send">;
  dynamo: Pick<DynamoDBDocumentClient, "send">;
}

export class AwsRunStore implements RunStore, RunHistory {
  constructor(private readonly config: AwsRunStoreConfig) {}

  async save(result: RunResult, createdAt: Date, userId: string): Promise<RunRecord> {
    const draft = toRunRecord(result, createdAt, userId);
    const { tableName, bucket, s3, dynamo } = this.config;

    // Manifest first: a run record must never point at a manifest that was not written.
    const stored = await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: draft.manifestKey,
        Body: JSON.stringify(result.manifest),
        ContentType: "application/json",
        // Kept unchanged as long as its run record. Governance mode, not compliance: an
        // administrator can still delete it early, for instance to honour an erasure request.
        ObjectLockMode: "GOVERNANCE",
        ObjectLockRetainUntilDate: new Date(draft.expiresAt * 1000),
        // Required on any upload with a retention period, and stored with the object, so the
        // manifest can later be checked against the hash S3 recorded.
        ChecksumAlgorithm: "SHA256",
      }),
    );
    if (!stored.VersionId || !stored.ChecksumSHA256) {
      throw new Error(`S3 returned no version or checksum for ${draft.manifestKey}`);
    }
    const record: RunRecord = {
      ...draft,
      manifestVersionId: stored.VersionId,
      manifestSha256: stored.ChecksumSHA256,
    };
    await dynamo.send(
      new PutCommand({
        TableName: tableName,
        Item: record,
        ConditionExpression: "attribute_not_exists(runId)",
      }),
    );
    return record;
  }

  async listRuns(userId: string, limit: number): Promise<RunSummary[]> {
    const { Items = [] } = await this.config.dynamo.send(
      new QueryCommand({
        TableName: this.config.tableName,
        IndexName: RUNS_BY_USER_INDEX,
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: { ":userId": userId },
        ScanIndexForward: false,
        Limit: limit,
      }),
    );
    return Items.flatMap((item) => {
      const summary = RunSummarySchema.safeParse(item);
      return summary.success ? [summary.data] : [];
    });
  }

  async findRun(runId: string): Promise<StoredRunRecord | null> {
    const { Item } = await this.config.dynamo.send(
      new GetCommand({ TableName: this.config.tableName, Key: { runId } }),
    );
    return (Item as StoredRunRecord | undefined) ?? null;
  }

  async readManifest(
    record: StoredRunRecord,
  ): Promise<{ manifest: Manifest; verified: boolean } | null> {
    const object = await this.config.s3.send(
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: record.manifestKey,
        VersionId: record.manifestVersionId,
        // The SDK then rejects a body that does not match the checksum S3 stored with it.
        ChecksumMode: "ENABLED",
      }),
    );
    const manifest = ManifestSchema.safeParse(
      JSON.parse((await object.Body?.transformToString()) ?? "null"),
    );
    if (!manifest.success) return null;
    const verified =
      record.manifestSha256 !== undefined && object.ChecksumSHA256 === record.manifestSha256;
    return { manifest: manifest.data, verified };
  }
}
