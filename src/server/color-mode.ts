import "server-only";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";

import { appDatabase } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { withTenant } from "@/server/db/tenant";
import { serverEnv } from "@/server/env";
import {
  COLOR_MODE_COOKIE,
  DEFAULT_COLOR_MODE,
  isColorMode,
} from "@/ui/color-mode";
import type { ColorMode } from "@/ui/color-mode";

/**
 * Mode d'affichage (ADR 0052), sur le modèle de la langue (ADR 0022) : le compte garde le
 * choix, le cookie le porte jusqu'au rendu de chaque page.
 */

type Person = { organizationId: string; userId: string };

const ONE_YEAR = 365 * 24 * 3600;

function secureCookies(): boolean {
  return serverEnv().APP_URL.startsWith("https://");
}

/** Mode de la requête en cours ; clair si le cookie manque ou a été altéré. */
export async function currentColorMode(): Promise<ColorMode> {
  const value = (await cookies()).get(
    COLOR_MODE_COOKIE(secureCookies()),
  )?.value;
  return isColorMode(value) ? value : DEFAULT_COLOR_MODE;
}

export async function setColorModeCookie(mode: ColorMode): Promise<void> {
  const secure = secureCookies();
  (await cookies()).set(COLOR_MODE_COOKIE(secure), mode, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR,
  });
}

/** Enregistre le choix dans le compte : la base n'accepte que sa propre ligne. */
export async function saveColorMode(
  person: Person,
  mode: ColorMode,
): Promise<void> {
  await withTenant(appDatabase(), person, (tx) =>
    tx
      .update(users)
      .set({ colorMode: mode })
      .where(eq(users.id, person.userId)),
  );
}

/** À la connexion : l'affichage suit le compte, sur tout nouvel appareil. */
export async function syncColorModeCookie(
  session: Person | null,
): Promise<void> {
  if (!session) return;
  const [row] = await withTenant(appDatabase(), session, (tx) =>
    tx
      .select({ colorMode: users.colorMode })
      .from(users)
      .where(eq(users.id, session.userId)),
  );
  await setColorModeCookie(row?.colorMode ?? DEFAULT_COLOR_MODE);
}
