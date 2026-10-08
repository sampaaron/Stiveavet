"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { LOCALES } from "@/i18n/locales";
import { currentSession } from "@/server/auth";
import { saveUiLocale, setUiLocaleCookie } from "@/server/ui-locale";

/**
 * Retour après le choix : une page de l'espace cabinet ou de connexion, sur ce site
 * uniquement (jamais `//autre-site`, ni une adresse absolue).
 */
const backPath = z
  .string()
  .max(512)
  .regex(
    /^\/(app|connexion|inscription|mot-de-passe-oublie|mot-de-passe|invitation|verrouillage)(?:[/?][\w\-./?=&%[\]]*)?$/,
  );

const choiceInput = z.object({ locale: z.enum(LOCALES), back: backPath });

/** Langue de l'interface : gardée dans le compte si la personne est connectée (ADR 0022). */
export async function chooseLocaleAction(form: FormData): Promise<void> {
  const parsed = choiceInput.safeParse({
    locale: form.get("locale"),
    back: form.get("back"),
  });
  if (!parsed.success) redirect("/app");
  const session = await currentSession();
  if (session && !session.locked)
    await saveUiLocale(session, parsed.data.locale);
  await setUiLocaleCookie(parsed.data.locale);
  redirect(parsed.data.back);
}
