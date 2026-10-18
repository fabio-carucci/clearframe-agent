import { describe, expect, it } from "vitest";
import { ACCESS_TOKEN_HEADER, type AccessTokenVerifier, authenticate } from "./auth";

const verifier: AccessTokenVerifier = {
  verify: async (token) => {
    if (token !== "valid-token") throw new Error("bad signature");
    return { sub: "user-123" };
  },
};

describe("authenticate", () => {
  it("returns the Cognito subject of a valid access token", async () => {
    await expect(authenticate({ [ACCESS_TOKEN_HEADER]: "valid-token" }, verifier)).resolves.toEqual(
      { userId: "user-123" },
    );
  });

  it("rejects a token the verifier does not accept", async () => {
    await expect(authenticate({ [ACCESS_TOKEN_HEADER]: "forged" }, verifier)).resolves.toBeNull();
  });

  it("rejects a request without the token header", async () => {
    await expect(authenticate({}, verifier)).resolves.toBeNull();
  });

  it("ignores the Authorization header, which carries CloudFront's signature", async () => {
    await expect(authenticate({ authorization: "valid-token" }, verifier)).resolves.toBeNull();
  });
});
