import { PUBLISHED_SIGNING_KEYS } from "@clearframe/contracts/certificate";

export const dynamic = "force-static";

/**
 * The published signing keys as a JSON Web Key Set, for verifiers that do not use /verify. Built
 * from signing-keys.json, so it lists exactly the keys the page trusts.
 */
export async function GET() {
  const keys = await Promise.all(
    PUBLISHED_SIGNING_KEYS.map(async ({ keyId, spki }) => {
      const der = Uint8Array.from(atob(spki), (char) => char.charCodeAt(0));
      const key = await crypto.subtle.importKey(
        "spki",
        der,
        { name: "ECDSA", namedCurve: "P-256" },
        true,
        ["verify"],
      );
      const { kty, crv, x, y } = await crypto.subtle.exportKey("jwk", key);
      return { kty, crv, x, y, kid: keyId, alg: "ES256", use: "sig" };
    }),
  );
  return Response.json({ keys });
}
