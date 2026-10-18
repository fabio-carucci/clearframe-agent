import { APICallError } from "ai";

export const RUN_ERROR_CODES = [
  "timeout",
  "rate_limited",
  "provider_unavailable",
  "provider_rejected",
  "internal_error",
] as const;

export type RunErrorCode = (typeof RUN_ERROR_CODES)[number];

/** `code` is safe to return to callers; `message` may name ARNs or accounts and stays internal. */
export interface RunError {
  code: RunErrorCode;
  message: string;
}

/** The AI SDK aborts a run that exceeds its timeout with a DOMException named TimeoutError. */
function isTimeout(error: unknown, depth = 0): boolean {
  if (typeof error !== "object" || error === null || depth >= 3) return false;
  const candidate = error as { name?: unknown; cause?: unknown };
  return candidate.name === "TimeoutError" || isTimeout(candidate.cause, depth + 1);
}

function findApiCallError(error: unknown, depth = 0): APICallError | undefined {
  if (APICallError.isInstance(error)) return error;
  if (depth >= 3 || typeof error !== "object" || error === null) return undefined;
  // Retries wrap the provider error in `lastError`; other wrappers use `cause`.
  const wrapper = error as { lastError?: unknown; cause?: unknown };
  return findApiCallError(wrapper.lastError ?? wrapper.cause, depth + 1);
}

export function toRunError(error: unknown): RunError {
  const message = (
    error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  ).slice(0, 500);
  if (isTimeout(error)) return { code: "timeout", message };
  const apiError = findApiCallError(error);
  if (!apiError) return { code: "internal_error", message };
  const status = apiError.statusCode;
  if (status === 429) return { code: "rate_limited", message };
  if (status === undefined || status >= 500) return { code: "provider_unavailable", message };
  return { code: "provider_rejected", message };
}
