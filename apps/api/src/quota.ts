import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { type DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";

export interface RunQuota {
  /** Counts one run against the user's UTC day; false, counting nothing, once the day is full. */
  consume(userId: string, now: Date): Promise<boolean>;
}

export interface DynamoRunQuotaConfig {
  tableName: string;
  dailyLimit: number;
  dynamo: Pick<DynamoDBDocumentClient, "send">;
}

const DAY_SECONDS = 86_400;

export class DynamoRunQuota implements RunQuota {
  constructor(private readonly config: DynamoRunQuotaConfig) {}

  async consume(userId: string, now: Date): Promise<boolean> {
    const day = now.toISOString().slice(0, 10);
    const dayStart = Date.parse(`${day}T00:00:00Z`) / 1000;
    try {
      await this.config.dynamo.send(
        new UpdateCommand({
          TableName: this.config.tableName,
          // The day is part of the key, so a counter that TTL has not deleted yet, which can
          // take days, never counts toward a later day.
          Key: { userDay: `${userId}#${day}` },
          UpdateExpression: "ADD runs :one SET expiresAt = if_not_exists(expiresAt, :expiresAt)",
          ConditionExpression: "attribute_not_exists(runs) OR runs < :limit",
          ExpressionAttributeValues: {
            ":one": 1,
            ":limit": this.config.dailyLimit,
            ":expiresAt": dayStart + 2 * DAY_SECONDS,
          },
        }),
      );
      return true;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) return false;
      throw error;
    }
  }
}
