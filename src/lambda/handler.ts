import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { GetParametersCommand, SSMClient } from "@aws-sdk/client-ssm";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { LambdaFunctionURLEvent, LambdaFunctionURLResult } from "aws-lambda";
import { z } from "zod";
import { runClipAgent } from "../agent/run";
import { type CatalogData, loadCatalogData, s3JsonReader } from "../catalog/load";
import { embedQuery } from "../retrieval/embeddings";
import { logEvent } from "../tracing/log";
import { AwsRunStore } from "../tracing/run-store";
import { parseRunRequest } from "./request";

const env = z
  .object({
    DATA_BUCKET: z.string().min(1),
    RUNS_TABLE: z.string().min(1),
    ANTHROPIC_KEY_PARAM: z.string().min(1),
    API_TOKEN_PARAM: z.string().min(1),
  })
  .parse(process.env);

const SECRETS_TTL_MS = 5 * 60_000;

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

const sha256 = (value: string) => createHash("sha256").update(value).digest();

async function fetchSecrets(): Promise<{ apiTokenHash: Buffer }> {
  const { Parameters = [] } = await ssm.send(
    new GetParametersCommand({
      Names: [env.ANTHROPIC_KEY_PARAM, env.API_TOKEN_PARAM],
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
  return { apiTokenHash: sha256(parameter(env.API_TOKEN_PARAM)) };
}

/**
 * Both caches drop a rejected promise so the next request retries. Secrets also expire, so a
 * rotated token stops working within SECRETS_TTL_MS instead of living as long as the container.
 */
let secrets: { value: Promise<{ apiTokenHash: Buffer }>; fetchedAt: number } | undefined;
function getSecrets() {
  if (!secrets || Date.now() - secrets.fetchedAt > SECRETS_TTL_MS) {
    const value = fetchSecrets().catch((error: unknown) => {
      secrets = undefined;
      throw error;
    });
    secrets = { value, fetchedAt: Date.now() };
  }
  return secrets.value;
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
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

/** Hashing first gives equal-length buffers, so the comparison time does not leak the token. */
function isAuthorized(header: string | undefined, expectedHash: Buffer): boolean {
  const token = header?.match(/^Bearer (.+)$/)?.[1];
  return token !== undefined && timingSafeEqual(sha256(token), expectedHash);
}

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

  const { apiTokenHash } = await getSecrets();
  if (!isAuthorized(event.headers.authorization, apiTokenHash)) {
    return json(401, { error: "Missing or invalid bearer token" });
  }

  const createdAt = new Date();
  const request = parseRunRequest(parseJsonBody(event), createdAt.toISOString().slice(0, 10));
  if (!request.ok) {
    return json(400, { error: request.error, issues: request.issues });
  }

  const runId = randomUUID();
  const { prompt, territory, date } = request;
  logEvent("run_started", { runId, territory, date });

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
    await store.save(result, createdAt);
  } catch (error) {
    logEvent("trace_failed", { runId, error: String(error) });
  }

  logEvent("run_finished", {
    runId,
    stopReason: manifest.stopReason,
    clipCount: manifest.clips.length,
    rejectedCount: manifest.rejected.length,
    costUsd: manifest.costUsd,
    durationMs: manifest.durationMs,
    ...(result.error && { errorCode: result.error.code, errorMessage: result.error.message }),
  });

  return json(manifest.stopReason === "error" ? 502 : 200, manifest);
}
