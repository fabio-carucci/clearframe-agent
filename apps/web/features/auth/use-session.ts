"use client";

import { useQuery } from "@tanstack/react-query";
import type { User, UserManager } from "oidc-client-ts";
import { useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api-error";
import { type WebConfig, loadWebConfig } from "./config";
import { cognitoLogoutUrl, createUserManager, isSignInCallback } from "./oidc";

export type Session =
  | { status: "loading" }
  | { status: "unavailable"; message: string }
  | { status: "preview" }
  | { status: "signedOut"; signIn: () => void }
  | {
      status: "signedIn";
      email: string;
      getAccessToken: () => Promise<string>;
      signOut: () => void;
    };

// The authorization code in the callback URL is single-use; React runs effects twice in
// development, and a second exchange would fail and sign the user out.
let pendingSignIn: Promise<User> | undefined;

async function restoreUser(manager: UserManager): Promise<User | null> {
  const url = new URL(window.location.href);
  if (isSignInCallback(url)) {
    const user = await (pendingSignIn ??= manager.signinRedirectCallback());
    window.history.replaceState(null, "", "/");
    return user;
  }
  const user = await manager.getUser();
  return user && !user.expired ? user : null;
}

async function accessToken(manager: UserManager): Promise<string> {
  const current = await manager.getUser();
  const user = current && !current.expired ? current : await manager.signinSilent();
  if (!user) throw new ApiError("Your session has expired. Sign in again.", 401);
  return user.access_token;
}

export function useSession(): Session {
  const config = useQuery({
    queryKey: ["web-config"],
    queryFn: loadWebConfig,
    staleTime: Infinity,
    retry: 1,
  });
  const manager = useMemo(
    () => (config.data ? createUserManager(config.data) : null),
    [config.data],
  );
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    if (!manager) return;
    let active = true;
    restoreUser(manager)
      .then((restored) => active && setUser(restored))
      .catch(() => active && setUser(null));
    const onLoaded = (loaded: User) => setUser(loaded);
    const onUnloaded = () => setUser(null);
    manager.events.addUserLoaded(onLoaded);
    manager.events.addUserUnloaded(onUnloaded);
    return () => {
      active = false;
      manager.events.removeUserLoaded(onLoaded);
      manager.events.removeUserUnloaded(onUnloaded);
    };
  }, [manager]);

  if (config.isPending) return { status: "loading" };
  if (config.isError) {
    return { status: "unavailable", message: "This site's configuration could not be loaded." };
  }
  if (config.data === null) return { status: "preview" };
  if (!manager || user === undefined) return { status: "loading" };
  const webConfig: WebConfig = config.data;
  if (!user) return { status: "signedOut", signIn: () => void manager.signinRedirect() };

  return {
    status: "signedIn",
    email: typeof user.profile.email === "string" ? user.profile.email : "Signed in",
    getAccessToken: () => accessToken(manager),
    signOut: () => {
      void manager.removeUser().then(() => window.location.assign(cognitoLogoutUrl(webConfig)));
    },
  };
}
