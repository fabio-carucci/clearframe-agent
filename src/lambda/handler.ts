import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { GetParametersCommand, SSMClient } from "@aws-sdk/client-ssm";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { LambdaFunctionURLEvent, LambdaFunctionURLResult } from "aws-lambda";
import { z } from "zod";
import { runClipAgent } from "../agent/run";
import { type CatalogData, loadCatalogData, s3JsonReader } from "../catalog/load";
import { IsoDateSchema, TerritorySchema } from "../catalog/schema";
import { embedQuery } from "../retrieval/embeddings";
import { logEvent } from "../tracing/log";
import { AwsRunStore } from "../tracing/run-store";

const env = z
  .object({
    DATA_BUCKET: z.string().min(1),
    RUNS_TABLE: z.string().min(1),
    ANTHROPIC_KEY_PARAM: z.string().min(1),
    API_TOKEN_PARAM: z.string().min(1),
  })
  .parse(process.env);

const s3 = new S3Client({});
const store = new AwsRunStore({
  tableName: env.RUNS_TABLE,
  bucket: env.DATA_BUCKET,
  s3,
  dynamo: DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
  }),
});

const RequestBodySchema = z.object({
  prompt: z.string().min(1).max(2000),
  territory: TerritorySchema,
  date: IsoDateSchema.optional(),
});

interface ColdStart {
  data: CatalogData;
  apiTokenHash: Buffer;
}

const sha256 = (value: string) => createHash("sha256").update(value).digest();

async function initialize(): Promise<ColdStart> {
  const ssm = new SSMClient({});
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
  return {
    data: await loadCatalogData(s3JsonReader(s3, env.DATA_BUCKET, "data/")),
    apiTokenHash: sha256(parameter(env.API_TOKEN_PARAM)),
  };
}

let coldStart: Promise<ColdStart> | undefined;

/** Retries initialization on the next request instead of caching a rejected promise forever. */
const ready = () =>
  (coldStart ??= initialize().catch((error: unknown) => {
    coldStart = undefined;
    throw error;
  }));

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

function parseBody(event: LambdaFunctionURLEvent): unknown {
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

  const { data, apiTokenHash } = await ready();
  if (!isAuthorized(event.headers.authorization, apiTokenHash)) {
    return json(401, { error: "Missing or invalid bearer token" });
  }

  const body = RequestBodySchema.safeParse(parseBody(event));
  if (!body.success) {
    return json(400, { error: "Invalid request", issues: z.treeifyError(body.error) });
  }

  const runId = randomUUID();
  const createdAt = new Date();
  const { prompt, territory, date = createdAt.toISOString().slice(0, 10) } = body.data;
  logEvent("run_started", { runId, territory, date });

  const result = await runClipAgent(
    { prompt, territory, date },
    { data, embedQuery, runId, onStep: (step) => logEvent("step", { runId, ...step }) },
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
