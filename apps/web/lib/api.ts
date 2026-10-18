import {
  type ComposeRequest,
  type ComposeResponse,
  ComposeResponseSchema,
} from "@clearframe/contracts";
import { z } from "zod";

/** What the form sends: the date is always set in the page, though the API would default it. */
export type ComposeInput = Required<ComposeRequest>;

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

export async function composeDataset(
  accessToken: string,
  input: ComposeInput,
): Promise<ComposeResponse> {
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
    const parsed = ComposeResponseSchema.safeParse(payload);
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
