import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { emailSender } from "@/adapters/email";
import { authService } from "@/domains/auth/service";
import type { AuthService } from "@/domains/auth/service";
import { appDatabase } from "@/server/db/client";
import { serverEnv } from "@/server/env";

import { readAuthCookie } from "./cookies";

let service: AuthService | undefined;

export function auth(): AuthService {
  service ??= authService({
    db: appDatabase(),
    // Résolu au premier envoi : lire une session n'exige pas de configuration e-mail.
    email: { send: (message) => emailSender().send(message) },
    appUrl: serverEnv().APP_URL,
  });
  return service;
}

/** Session courante, résolue une seule fois par requête (verrouillage compris). */
export const currentSession = cache(async () =>
  auth().resolveSession(await readAuthCookie("session")),
);

/**
 * Première étape de la garde serveur (architecture §6) : personne authentifiée, session
 * déverrouillée, appartenance active. À appeler dans chaque page et action de l'espace cabinet.
 */
export async function requireSession() {
  const session = await currentSession();
  if (!session) redirect("/connexion");
  if (session.locked) redirect("/verrouillage");
  return session;
}
