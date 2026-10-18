import { CognitoJwtVerifier } from "aws-jwt-verify";
import { z } from "zod";

/**
 * CloudFront signs every request to the private function URL with its own Authorization header,
 * so the user's Cognito access token travels in this one instead.
 */
export const ACCESS_TOKEN_HEADER = "x-clearframe-access-token";

export const AuthConfigSchema = z.object({
  userPoolId: z.string().min(1),
  clientId: z.string().min(1),
});

export type AuthConfig = z.infer<typeof AuthConfigSchema>;

export interface AccessTokenVerifier {
  verify(token: string): Promise<{ sub: string }>;
}

/** Checks signature, expiry, issuer, client id and that it is an access token, not an id token. */
export const createAccessTokenVerifier = (config: AuthConfig): AccessTokenVerifier =>
  CognitoJwtVerifier.create({
    userPoolId: config.userPoolId,
    clientId: config.clientId,
    tokenUse: "access",
  });

export interface Principal {
  userId: string;
}

export async function authenticate(
  headers: Readonly<Record<string, string | undefined>>,
  verifier: AccessTokenVerifier,
): Promise<Principal | null> {
  const token = headers[ACCESS_TOKEN_HEADER];
  if (!token) return null;
  try {
    const { sub } = await verifier.verify(token);
    return { userId: sub };
  } catch {
    return null;
  }
}
