import { randomUUID } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { GetParametersCommand, SSMClient } from "@aws-sdk/client-ssm";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { LambdaFunctionURLEvent, LambdaFunctionURLResult } from "aws-lambda";
import { z } from "zod";
import { runClipAgent } from "@clearframe/core/agent/run";
import { type CatalogData, loadCatalogData } from "@clearframe/core/catalog/load";
import { embedQuery } from "@clearframe/core/retrieval/embeddings";
import { logEvent } from "./log";
import { AwsRunStore } from "./run-store";
import {
  type AccessTokenVerifier,
  AuthConfigSchema,
  authenticate,
  createAccessTokenVerifier,
} from "./auth";
import { parseRunRequest } from "./request";
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

const json = (statusCode: number, body: unknown): LambdaFunctionURLResult => ({
  statusCode,
  headers: { "content-type": "application/json", "cache-control": "no-store" },
  body: JSON.stringify(body),
});

function parseJsonBody(event: LambdaFunctionURLEvent): unknown {
  if (!event.body) return undefined;
  const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString() : event.body;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export async function handler(event: LambdaFunctionURLEvent): Promise<LambdaFunctionURLResult> {
  if (event.requestContext.http.method !== "POST") {
    return json(405, { error: "Use POST with a JSON body" });
  }

  const { verifier } = await getRuntimeConfig();
  const principal = await authenticate(event.headers, verifier);
  if (!principal) {
    return json(401, { error: "Sign in again: the access token is missing, invalid or expired" });
  }

  const createdAt = new Date();
  const request = parseRunRequest(parseJsonBody(event), createdAt.toISOString().slice(0, 10));
  if (!request.ok) {
    return json(400, { error: request.error, issues: request.issues });
  }

  const runId = randomUUID();
  const { userId } = principal;
  const { prompt, territory, date } = request;
  logEvent("run_started", { runId, userId, territory, date });

  const result = await runClipAgent(
    { prompt, territory, date },
    {
      data: await getCatalog(),
      embedQuery,
      runId,
      onStep: (step) => logEvent("step", { runId, ...step }),
    },
  );
  const { manifest } = result;

  try {
    await store.save(result, createdAt, userId);
  } catch (error) {
    logEvent("trace_failed", { runId, error: String(error) });
  }

  logEvent("run_finished", {
    runId,
    userId,
    stopReason: manifest.stopReason,
    clipCount: manifest.clips.length,
    rejectedCount: manifest.rejected.length,
    costUsd: manifest.costUsd,
    durationMs: manifest.durationMs,
    ...(result.error && { errorCode: result.error.code, errorMessage: result.error.message }),
  });

  return json(manifest.stopReason === "error" ? 502 : 200, { manifest, steps: result.steps });
}
