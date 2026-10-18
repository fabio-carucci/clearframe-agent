import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { LambdaClient } from "@aws-sdk/client-lambda";
import { S3Client } from "@aws-sdk/client-s3";
import { GetParametersCommand, SSMClient } from "@aws-sdk/client-ssm";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { LanguageModel } from "ai";
import type { LambdaFunctionURLEvent } from "aws-lambda";
import { z } from "zod";
import { PUBLISHED_SIGNING_KEYS } from "@clearframe/contracts/certificate";
import { createAnthropic } from "@ai-sdk/anthropic";
import { MODEL_ID } from "@clearframe/core/agent/agent";
import { runClipAgent } from "@clearframe/core/agent/run";
import { loadCatalogData } from "@clearframe/core/catalog/load";
import { embedQuery } from "@clearframe/core/retrieval/embeddings";
import { logEvent } from "./log";
import { AwsRunStore } from "./run-store";
import { type AccessTokenVerifier, AuthConfigSchema, createAccessTokenVerifier } from "./auth";
import { cachedFor } from "./cache";
import type { ResponseSink } from "./compose";
import { DynamoRunQuota } from "./quota";
import { LambdaNotary } from "./notary";
import { route } from "./router";
import { s3JsonReader } from "./s3-reader";

const env = z
  .object({
    DATA_BUCKET: z.string().min(1),
    RUNS_TABLE: z.string().min(1),
    QUOTAS_TABLE: z.string().min(1),
    DAILY_RUN_LIMIT: z.coerce.number().int().positive(),
    ANTHROPIC_KEY_PARAM: z.string().min(1),
    AUTH_CONFIG_PARAM: z.string().min(1),
    NOTARY_FUNCTION: z.string().min(1),
  })
  .parse(process.env);

/**
 * Warm containers re-read both within these windows: a rotated Anthropic key, and a catalog
 * where a license was revoked, take effect without a redeploy.
 */
const RUNTIME_CONFIG_TTL_MS = 5 * 60_000;
const CATALOG_TTL_MS = 5 * 60_000;

const s3 = new S3Client({});
const ssm = new SSMClient({});
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const store = new AwsRunStore({ tableName: env.RUNS_TABLE, bucket: env.DATA_BUCKET, s3, dynamo });
const notary = new LambdaNotary(new LambdaClient({}), env.NOTARY_FUNCTION);
const quota = new DynamoRunQuota({
  tableName: env.QUOTAS_TABLE,
  dailyLimit: env.DAILY_RUN_LIMIT,
  dynamo,
});

async function fetchRuntimeConfig(): Promise<{
  verifier: AccessTokenVerifier;
  model: LanguageModel;
}> {
  const { Parameters = [] } = await ssm.send(
    new GetParametersCommand({
      Names: [env.ANTHROPIC_KEY_PARAM, env.AUTH_CONFIG_PARAM],
      WithDecryption: true,
    }),
  );
  const parameter = (name: string) => {
    const value = Parameters.find((p) => p.Name === name)?.Value;
    if (!value) throw new Error(`Missing SSM parameter ${name}`);
    return value;
  };
  const authConfig = AuthConfigSchema.parse(JSON.parse(parameter(env.AUTH_CONFIG_PARAM)));
  return {
    verifier: createAccessTokenVerifier(authConfig),
    model: createAnthropic({ apiKey: parameter(env.ANTHROPIC_KEY_PARAM) })(MODEL_ID),
  };
}

const runtimeConfig = cachedFor(RUNTIME_CONFIG_TTL_MS, fetchRuntimeConfig);
const catalog = cachedFor(CATALOG_TTL_MS, () =>
  loadCatalogData(s3JsonReader(s3, env.DATA_BUCKET, "data/")),
);

function lambdaSink(responseStream: awslambda.ResponseStream): ResponseSink {
  let body: awslambda.ResponseStream | undefined;
  return {
    start(statusCode, contentType) {
      body = awslambda.HttpResponseStream.from(responseStream, {
        statusCode,
        headers: { "content-type": contentType, "cache-control": "no-store" },
      });
    },
    write(chunk) {
      body?.write(chunk);
    },
    end: () => new Promise((resolve) => (body ?? responseStream).end(resolve)),
  };
}

export const handler = awslambda.streamifyResponse(
  async (event: LambdaFunctionURLEvent, responseStream) => {
    await route(
      event,
      {
        verifier: async () => (await runtimeConfig()).verifier,
        model: async () => (await runtimeConfig()).model,
        catalog,
        embedQuery,
        runAgent: runClipAgent,
        quota,
        notary,
        trustedKeys: PUBLISHED_SIGNING_KEYS,
        store,
        history: store,
        log: logEvent,
        now: () => new Date(),
      },
      lambdaSink(responseStream),
    );
  },
);
