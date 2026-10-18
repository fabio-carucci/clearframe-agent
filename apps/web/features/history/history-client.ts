import {
  type RunDetailResponse,
  RunDetailResponseSchema,
  type RunSummary,
  RunListResponseSchema,
} from "@clearframe/contracts";
import type { z } from "zod";
import { ApiError, refusal } from "../../lib/api-error";

async function getJson<T>(path: string, accessToken: string, schema: z.ZodType<T>): Promise<T> {
  const response = await fetch(path, {
    headers: { "x-clearframe-access-token": accessToken },
  });
  if (!response.ok) throw await refusal(response);
  const parsed = schema.safeParse(await response.json().catch(() => undefined));
  if (!parsed.success)
    throw new ApiError("The API answered in a shape this page does not understand.");
  return parsed.data;
}

/** The signed-in user's runs, newest first. */
export const fetchRuns = async (accessToken: string): Promise<RunSummary[]> =>
  (await getJson("/api/runs", accessToken, RunListResponseSchema)).runs;

/** One run, with the manifest version S3 holds for it and whether its checksum matched. */
export const fetchRun = (accessToken: string, runId: string): Promise<RunDetailResponse> =>
  getJson(`/api/runs/${encodeURIComponent(runId)}`, accessToken, RunDetailResponseSchema);
