import { APICallError } from "ai";
import { describe, expect, it } from "vitest";
import { toRunError } from "./errors";

const apiError = (statusCode: number | undefined) =>
  new APICallError({
    message: "User: arn:aws:sts::123456789012:assumed-role/x is not authorized",
    url: "https://api.example.com",
    requestBodyValues: {},
    statusCode,
  });

describe("toRunError", () => {
  it.each([
    [429, "rate_limited"],
    [503, "provider_unavailable"],
    [undefined, "provider_unavailable"],
    [403, "provider_rejected"],
  ] as const)("maps provider status %s to %s", (status, code) => {
    expect(toRunError(apiError(status)).code).toBe(code);
  });

  it("finds the provider error inside a retry wrapper", () => {
    expect(toRunError({ lastError: apiError(429) }).code).toBe("rate_limited");
  });

  it("treats anything else as an internal error", () => {
    expect(toRunError(new TypeError("boom"))).toEqual({
      code: "internal_error",
      message: "TypeError: boom",
    });
  });

  it("caps the internal message length", () => {
    expect(toRunError(new Error("x".repeat(2000))).message).toHaveLength(500);
  });
});
