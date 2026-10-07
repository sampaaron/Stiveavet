import "server-only";

import { headers } from "next/headers";
import { isIP } from "node:net";

import type { RequestOrigin } from "@/domains/auth/service";
import { serverEnv } from "@/server/env";

/** IP et navigateur de la requête ; l'IP n'est lue que derrière un proxy de confiance. */
export async function requestOrigin(): Promise<RequestOrigin> {
  const list = await headers();
  const userAgent = list.get("user-agent")?.slice(0, 200) ?? null;
  if (!serverEnv().TRUST_PROXY) return { ip: null, userAgent };
  // Le répartiteur ajoute l'adresse du client en dernier : c'est la seule valeur fiable.
  const forwarded = list.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  return { ip: forwarded && isIP(forwarded) ? forwarded : null, userAgent };
}
