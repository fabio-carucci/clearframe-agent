import {
  type ComposeRequest,
  type ComposeResponse,
  type RunEvent,
  RunEventSchema,
} from "@clearframe/contracts";
import { z } from "zod";
import { ApiError } from "../../lib/api-error";

/** What the form sends: the date is always set in the page, though the API would default it. */
export type ComposeInput = Required<ComposeRequest>;

const NDJSON = "application/x-ndjson";

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Splits a byte stream into non-empty lines. The last line may arrive without a newline. */
export async function* ndjsonLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  // stream: true holds back a multi-byte character split across two chunks until the next one.
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      if (line) yield line;
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) yield buffer.trim();
}

function parseEvent(line: string): RunEvent {
  let json: unknown;
  try {
    json = JSON.parse(line);
  } catch {
    throw new ApiError("The API sent a line this page cannot read.");
  }
  const parsed = RunEventSchema.safeParse(json);
  if (!parsed.success) throw new ApiError("The API sent an event this page does not understand.");
  return parsed.data;
}

const ErrorBodySchema = z.object({ error: z.string() });

async function refusal(response: Response): Promise<ApiError> {
  if (response.status === 401) {
    return new ApiError("Your session has expired. Sign in again to compose a dataset.", 401);
  }
  const body = ErrorBodySchema.safeParse(await response.json().catch(() => undefined));
  return new ApiError(
    body.success ? body.data.error : `The API answered with status ${response.status}.`,
    response.status,
  );
}

/**
 * Starts a run and hands each of its events to `onEvent` as the server sends it. Resolves with the
 * result once the server reports it recorded; rejects if the API refuses the request, or if the
 * run could not be recorded for audit, in which case no manifest was issued.
 */
export async function composeLive(
  accessToken: string,
  input: ComposeInput,
  onEvent: (event: RunEvent) => void,
): Promise<ComposeResponse> {
  const body = JSON.stringify(input);
  const response = await fetch("/api", {
    method: "POST",
    headers: {
      accept: NDJSON,
      "content-type": "application/json",
      "x-clearframe-access-token": accessToken,
      // CloudFront signs POSTs to the Lambda with this hash; Lambda rejects unsigned payloads.
      "x-amz-content-sha256": await sha256Hex(body),
    },
    body,
  });
  if (!response.ok) throw await refusal(response);
  if (!response.body || !response.headers.get("content-type")?.includes(NDJSON)) {
    throw new ApiError("The API did not answer with a stream of run events.", response.status);
  }

  for await (const line of ndjsonLines(response.body)) {
    const event = parseEvent(line);
    onEvent(event);
    if (event.type === "completed") return event.result;
    if (event.type === "failed") throw new ApiError(event.error);
  }
  throw new ApiError(
    "The connection closed before the run finished. The run may still have been recorded.",
  );
}
