import "server-only";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";

import { UI_LOCALE_COOKIE } from "@/i18n/cookie";
import type { Locale } from "@/i18n/locales";
import { appDatabase } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { withTenant } from "@/server/db/tenant";
import { serverEnv } from "@/server/env";

/**
 * Langue de l'interface (ADR 0022). Le compte garde le choix de la personne ; le cookie le
 * porte jusqu'au proxy, qui en déduit la langue de chaque page. Simple préférence : aucun
 * accès ni aucune donnée n'en dépend.
 */

type Person = { organizationId: string; userId: string };

const ONE_YEAR = 365 * 24 * 3600;

export async function setUiLocaleCookie(locale: Locale): Promise<void> {
  const secure = serverEnv().APP_URL.startsWith("https://");
  (await cookies()).set(UI_LOCALE_COOKIE(secure), locale, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR,
  });
}

/** Langue enregistrée dans le compte de la personne (lue sous RLS). */
async function storedUiLocale(person: Person): Promise<Locale> {
  return withTenant(appDatabase(), person, async (tx) => {
    const [row] = await tx
      .select({ uiLocale: users.uiLocale })
      .from(users)
      .where(eq(users.id, person.userId));
    return row?.uiLocale ?? "fr";
  });
}

/** Enregistre le choix dans le compte : la base n'accepte que sa propre ligne. */
export async function saveUiLocale(
  person: Person,
  locale: Locale,
): Promise<void> {
  await withTenant(appDatabase(), person, (tx) =>
    tx
      .update(users)
      .set({ uiLocale: locale })
      .where(eq(users.id, person.userId)),
  );
}

/** À la connexion : la page suit la langue du compte, sur tout nouvel appareil. */
export async function syncUiLocaleCookie(
  session: Person | null,
): Promise<void> {
  if (session) await setUiLocaleCookie(await storedUiLocale(session));
}
