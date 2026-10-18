import { PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { type DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import type { RunResult } from "@clearframe/core/agent/run";
import { type RunRecord, toRunRecord } from "./run-record";

export interface RunStore {
  save(result: RunResult, createdAt: Date, userId: string): Promise<RunRecord>;
}

export interface AwsRunStoreConfig {
  tableName: string;
  bucket: string;
  s3: Pick<S3Client, "send">;
  dynamo: Pick<DynamoDBDocumentClient, "send">;
}

export class AwsRunStore implements RunStore {
  constructor(private readonly config: AwsRunStoreConfig) {}

  async save(result: RunResult, createdAt: Date, userId: string): Promise<RunRecord> {
    const record = toRunRecord(result, createdAt, userId);
    const { tableName, bucket, s3, dynamo } = this.config;

    // Manifest first: a run record must never point at a manifest that was not written.
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: record.manifestKey,
        Body: JSON.stringify(result.manifest),
        ContentType: "application/json",
        // Kept unchanged as long as its run record. Governance mode, not compliance: an
        // administrator can still delete it early, for instance to honour an erasure request.
        ObjectLockMode: "GOVERNANCE",
        ObjectLockRetainUntilDate: new Date(record.expiresAt * 1000),
        // Required on any upload with a retention period, and stored with the object, so the
        // manifest can later be checked against the hash S3 recorded.
        ChecksumAlgorithm: "SHA256",
      }),
    );
    await dynamo.send(
      new PutCommand({
        TableName: tableName,
        Item: record,
        ConditionExpression: "attribute_not_exists(runId)",
      }),
    );
    return record;
  }
}
