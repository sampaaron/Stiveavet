import "server-only";

import { cookies } from "next/headers";

import { AUTH_POLICY } from "@/domains/auth/policy";
import { serverEnv } from "@/server/env";

/**
 * Cookies d'authentification : httpOnly, SameSite=Lax, Secure dès que l'application est en
 * HTTPS (préfixe __Host- alors imposé : ni domaine, ni chemin autre que /).
 */
function secure() {
  return serverEnv().APP_URL.startsWith("https://");
}

function name(base: string) {
  return secure() ? `__Host-${base}` : base;
}

export const COOKIE = {
  session: () => name("sv_session"),
  device: () => name("sv_device"),
  challenge: () => name("sv_challenge"),
  /** Accès à la démo du site public : n'ouvre que des données fictives (ADR 0012). */
  demo: () => name("sv_demo"),
};

function options(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: secure(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export async function readAuthCookie(
  kind: keyof typeof COOKIE,
): Promise<string | undefined> {
  return (await cookies()).get(COOKIE[kind]())?.value;
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  const seconds = Math.max(
    0,
    Math.floor((expiresAt.getTime() - Date.now()) / 1000),
  );
  (await cookies()).set(COOKIE.session(), token, options(seconds));
}

export async function setDeviceCookie(token: string) {
  (await cookies()).set(
    COOKIE.device(),
    token,
    options(AUTH_POLICY.trustedDeviceDays * 24 * 3600),
  );
}

export async function setChallengeCookie(token: string) {
  (await cookies()).set(
    COOKIE.challenge(),
    token,
    options(AUTH_POLICY.codeMinutes * 60),
  );
}

export async function clearAuthCookie(kind: "session" | "challenge") {
  (await cookies()).delete(COOKIE[kind]());
}

/** Accès à la démo : 14 jours, comme la validité côté serveur (migration 0007). */
export async function setDemoCookie(token: string) {
  (await cookies()).set(COOKIE.demo(), token, options(14 * 24 * 3600));
}
