import { UserManager, WebStorageStateStore } from "oidc-client-ts";
import type { WebConfig } from "./config";

export function createUserManager(config: WebConfig): UserManager {
  const home = `${window.location.origin}/`;
  return new UserManager({
    authority: config.issuer,
    client_id: config.clientId,
    redirect_uri: home,
    post_logout_redirect_uri: home,
    response_type: "code",
    scope: "openid email",
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),
  });
}

export const isSignInCallback = (url: URL) =>
  url.searchParams.has("code") && url.searchParams.has("state");

/** Cognito does not publish an end-session endpoint in its discovery document. */
export function cognitoLogoutUrl(config: WebConfig): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    logout_uri: `${window.location.origin}/`,
  });
  return `https://${config.authDomain}/logout?${params}`;
}
