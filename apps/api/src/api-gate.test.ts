import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACCESS_TOKEN_HEADER } from "./auth";

const source = readFileSync(
  new URL("../../../infra/modules/web/api-gate.js", import.meta.url),
  "utf8",
);
const handler = new Function(`"use strict";\n${source}\nreturn handler;`)() as (event: unknown) => {
  statusCode?: number;
};

const segment = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const jwt = (claims: Record<string, unknown>) =>
  `${segment({ alg: "RS256", kid: "k" })}.${segment(claims)}.signature`;
const inAnHour = () => Math.floor(Date.now() / 1000) + 3600;

/** A CloudFront viewer-request event; a header overridden with undefined is left out. */
function request(
  overrides: { method?: string; headers?: Record<string, string | undefined> } = {},
) {
  const headers = {
    "x-amz-content-sha256": "e3b0c44298fc1c149afbf4c8996fb924",
    [ACCESS_TOKEN_HEADER]: jwt({ token_use: "access", exp: inAnHour() }),
    ...overrides.headers,
  };
  return {
    request: {
      method: overrides.method ?? "POST",
      uri: "/api",
      headers: Object.fromEntries(
        Object.entries(headers).flatMap(([name, value]) =>
          value === undefined ? [] : [[name, { value }]],
        ),
      ),
    },
  };
}

describe("api gate (CloudFront Function)", () => {
  it("forwards a signed POST with an unexpired access token unchanged", () => {
    const event = request();
    expect(handler(event)).toBe(event.request);
  });

  it("decodes unpadded base64url payloads", () => {
    const token = jwt({ token_use: "access", exp: inAnHour(), username: "?>?>>>~" });
    expect(token.split(".")[1]).toMatch(/[-_]/);
    const event = request({ headers: { [ACCESS_TOKEN_HEADER]: token } });
    expect(handler(event)).toBe(event.request);
  });

  it("rejects methods other than POST with 405", () => {
    expect(handler(request({ method: "GET" })).statusCode).toBe(405);
  });

  it("rejects a POST without the payload hash with 400", () => {
    const event = request({ headers: { "x-amz-content-sha256": undefined } });
    expect(handler(event).statusCode).toBe(400);
  });

  it.each([
    ["no token", undefined],
    ["a token that is not a JWT", "not-a-token"],
    ["a payload that is not JSON", "a.%%%.c"],
    ["an expired token", jwt({ token_use: "access", exp: Math.floor(Date.now() / 1000) - 1 })],
    ["an id token", jwt({ token_use: "id", exp: inAnHour() })],
    ["a token without expiry", jwt({ token_use: "access" })],
  ])("rejects %s with 401", (_case, token) => {
    const event = request({ headers: { [ACCESS_TOKEN_HEADER]: token } });
    expect(handler(event).statusCode).toBe(401);
  });
});
