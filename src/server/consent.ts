import "server-only";

import { cookies } from "next/headers";

import {
  consentMaxAgeSeconds,
  encodeConsent,
  parseConsent,
} from "@/domains/consentement/cookies";
import type { Consent } from "@/domains/consentement/cookies";
import { serverEnv } from "@/server/env";

/** Choix des cookies (ADR 0053) : gardé dans le navigateur seulement, six mois. */
function cookieName(): string {
  return serverEnv().APP_URL.startsWith("https://")
    ? "__Host-sv_consent"
    : "sv_consent";
}

export async function currentConsent(): Promise<Consent | null> {
  return parseConsent((await cookies()).get(cookieName())?.value, new Date());
}

export async function saveConsent(consent: Consent): Promise<void> {
  (await cookies()).set(cookieName(), encodeConsent(consent), {
    httpOnly: true,
    secure: serverEnv().APP_URL.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: consentMaxAgeSeconds(),
  });
}
