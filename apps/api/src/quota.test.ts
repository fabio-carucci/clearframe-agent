import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { describe, expect, it } from "vitest";
import { DynamoRunQuota } from "./quota";

function quotaWith(send: (command: UpdateCommand) => Promise<unknown>) {
  const sent: UpdateCommand[] = [];
  const quota = new DynamoRunQuota({
    tableName: "quotas",
    dailyLimit: 3,
    dynamo: {
      send: (async (command: UpdateCommand) => {
        sent.push(command);
        return send(command);
      }) as never,
    },
  });
  return { quota, sent };
}

const now = new Date("2026-10-18T23:30:00.000Z");

describe("DynamoRunQuota", () => {
  it("counts the run on the user's UTC day, only while it is under the limit", async () => {
    const { quota, sent } = quotaWith(async () => ({}));
    expect(await quota.consume("user-1", now)).toBe(true);

    const { input } = sent[0]!;
    expect(input.Key).toEqual({ userDay: "user-1#2026-10-18" });
    expect(input.ConditionExpression).toBe("attribute_not_exists(runs) OR runs < :limit");
    expect(input.ExpressionAttributeValues).toMatchObject({ ":one": 1, ":limit": 3 });
  });

  it("expires the counter two days after its day starts", async () => {
    const { quota, sent } = quotaWith(async () => ({}));
    await quota.consume("user-1", now);
    expect(sent[0]!.input.ExpressionAttributeValues?.[":expiresAt"]).toBe(
      Date.parse("2026-10-20T00:00:00Z") / 1000,
    );
  });

  it("refuses the run once the day's limit is reached", async () => {
    const { quota } = quotaWith(async () => {
      throw new ConditionalCheckFailedException({ message: "full", $metadata: {} });
    });
    expect(await quota.consume("user-1", now)).toBe(false);
  });

  it("fails closed: any other DynamoDB error propagates instead of allowing the run", async () => {
    const { quota } = quotaWith(async () => {
      throw new Error("ProvisionedThroughputExceededException");
    });
    await expect(quota.consume("user-1", now)).rejects.toThrow("ProvisionedThroughput");
  });
});
