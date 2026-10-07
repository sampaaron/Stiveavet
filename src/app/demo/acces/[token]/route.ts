import { NextResponse } from "next/server";

import { pathFor } from "@/i18n/routes";
import { setDemoCookie } from "@/server/auth/cookies";
import { serverEnv } from "@/server/env";
import { services } from "@/server/services";

/**
 * Lien du premier e-mail : ouvre la démo dans ce navigateur, puis redirige vers une adresse
 * sans jeton (il ne reste ni dans l'historique ni dans un en-tête Referer).
 */
export async function GET(
  _request: Request,
  context: RouteContext<"/demo/acces/[token]">,
) {
  const { token } = await context.params;
  const access = await services.demo().access(token);
  if (!access)
    return NextResponse.redirect(
      new URL(`${pathFor("demo", "fr")}?acces=expire`, serverEnv().APP_URL),
    );
  await setDemoCookie(token);
  return NextResponse.redirect(
    new URL(pathFor("demoSpace", access.locale), serverEnv().APP_URL),
  );
}
