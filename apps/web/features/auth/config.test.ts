import { describe, expect, it } from "vitest";
import { WebConfigSchema } from "./config";

const config = {
  region: "eu-west-1",
  issuer: "https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_EXAMPLE",
  clientId: "client",
  authDomain: "example.auth.eu-west-1.amazoncognito.com",
};

describe("WebConfigSchema", () => {
  it("reads a config.json written before signing keys were published", () => {
    expect(WebConfigSchema.parse(config).signingKeys).toEqual([]);
  });

  it("reads the published signing keys", () => {
    const signingKeys = [{ keyId: "9c8a2f4e", spki: "MFkwEwYHKoZIzj0CAQ" }];
    expect(WebConfigSchema.parse({ ...config, signingKeys }).signingKeys).toEqual(signingKeys);
  });
});
