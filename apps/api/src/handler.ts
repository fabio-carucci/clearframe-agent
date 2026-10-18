import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { GetParametersCommand, SSMClient } from "@aws-sdk/client-ssm";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { LambdaFunctionURLEvent } from "aws-lambda";
import { z } from "zod";
import { runClipAgent } from "@clearframe/core/agent/run";
import { type CatalogData, loadCatalogData } from "@clearframe/core/catalog/load";
import { embedQuery } from "@clearframe/core/retrieval/embeddings";
import { logEvent } from "./log";
import { AwsRunStore } from "./run-store";
import { type AccessTokenVerifier, AuthConfigSchema, createAccessTokenVerifier } from "./auth";
import { type ResponseSink, compose } from "./compose";
import { s3JsonReader } from "./s3-reader";

const env = z
  .object({
    DATA_BUCKET: z.string().min(1),
    RUNS_TABLE: z.string().min(1),
    ANTHROPIC_KEY_PARAM: z.string().min(1),
    AUTH_CONFIG_PARAM: z.string().min(1),
  })
  .parse(process.env);

const RUNTIME_CONFIG_TTL_MS = 5 * 60_000;

const s3 = new S3Client({});
const ssm = new SSMClient({});
const store = new AwsRunStore({
  tableName: env.RUNS_TABLE,
  bucket: env.DATA_BUCKET,
  s3,
  dynamo: DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
  }),
});

async function fetchRuntimeConfig(): Promise<{ verifier: AccessTokenVerifier }> {
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
  // The Anthropic provider reads the key from the environment on every call.
  process.env.ANTHROPIC_API_KEY = parameter(env.ANTHROPIC_KEY_PARAM);
  const authConfig = AuthConfigSchema.parse(JSON.parse(parameter(env.AUTH_CONFIG_PARAM)));
  return { verifier: createAccessTokenVerifier(authConfig) };
}

/**
 * Both caches drop a rejected promise so the next request retries. The runtime config also
 * expires, so a rotated Anthropic key reaches warm containers within RUNTIME_CONFIG_TTL_MS.
 */
let runtimeConfig:
  { value: Promise<{ verifier: AccessTokenVerifier }>; fetchedAt: number } | undefined;
function getRuntimeConfig() {
  if (!runtimeConfig || Date.now() - runtimeConfig.fetchedAt > RUNTIME_CONFIG_TTL_MS) {
    const value = fetchRuntimeConfig().catch((error: unknown) => {
      runtimeConfig = undefined;
      throw error;
    });
    runtimeConfig = { value, fetchedAt: Date.now() };
  }
  return runtimeConfig.value;
}

let catalog: Promise<CatalogData> | undefined;
const getCatalog = () =>
  (catalog ??= loadCatalogData(s3JsonReader(s3, env.DATA_BUCKET, "data/")).catch(
    (error: unknown) => {
      catalog = undefined;
      throw error;
    },
  ));

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
    await compose(
      event,
      {
        verifier: async () => (await getRuntimeConfig()).verifier,
        catalog: getCatalog,
        embedQuery,
        runAgent: runClipAgent,
        store,
        log: logEvent,
        now: () => new Date(),
      },
      lambdaSink(responseStream),
    );
  },
);
