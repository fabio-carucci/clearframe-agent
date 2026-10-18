import { z } from "zod";

const ManifestSchema = z.object({
  runId: z.string(),
  request: z.object({ prompt: z.string(), territory: z.string(), date: z.string() }),
  clips: z.array(
    z.object({
      clipId: z.string(),
      title: z.string(),
      genre: z.string(),
      language: z.string(),
      durationSec: z.number(),
      reason: z.string(),
    }),
  ),
  rejected: z.array(z.object({ clipId: z.string(), reasons: z.array(z.string()) })),
  stopReason: z.enum(["completed", "step_limit", "token_budget", "error"]),
  summary: z.string(),
  usage: z.object({
    steps: z.number(),
    inputTokens: z.number(),
    outputTokens: z.number(),
    embeddingTokens: z.number(),
  }),
  costUsd: z.number(),
  durationMs: z.number(),
});

const StepSchema = z.object({
  stepNumber: z.number(),
  toolCalls: z.array(z.string()),
  inputTokens: z.number(),
  outputTokens: z.number(),
  durationMs: z.number(),
});

export const RunResponseSchema = z.object({
  manifest: ManifestSchema,
  steps: z.array(StepSchema),
});

export type RunResponse = z.infer<typeof RunResponseSchema>;
export type Manifest = RunResponse["manifest"];
export type Step = RunResponse["steps"][number];

export interface RunInput {
  prompt: string;
  territory: string;
  date: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function composeDataset(accessToken: string, input: RunInput): Promise<RunResponse> {
  const body = JSON.stringify(input);
  const response = await fetch("/api", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-clearframe-access-token": accessToken,
      // CloudFront signs POSTs to the Lambda with this hash; Lambda rejects unsigned payloads.
      "x-amz-content-sha256": await sha256Hex(body),
    },
    body,
  });
  const payload: unknown = await response.json().catch(() => undefined);

  if (response.ok || response.status === 502) {
    const parsed = RunResponseSchema.safeParse(payload);
    if (parsed.success) return parsed.data;
    throw new ApiError(
      "The API answered in a shape this page does not understand.",
      response.status,
    );
  }
  const message = z.object({ error: z.string() }).safeParse(payload);
  if (response.status === 401) {
    throw new ApiError("Your session has expired. Sign in again to compose a dataset.", 401);
  }
  throw new ApiError(
    message.success ? message.data.error : `The API answered with status ${response.status}.`,
    response.status,
  );
}
