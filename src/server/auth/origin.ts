import "server-only";

import { headers } from "next/headers";

import type { RequestOrigin } from "@/domains/auth/service";
import { serverEnv } from "@/server/env";
import { clientIp } from "@/server/http/client-ip";

/** IP et navigateur de la requête ; l'IP n'est lue que derrière un proxy de confiance. */
export async function requestOrigin(): Promise<RequestOrigin> {
  const list = await headers();
  const userAgent = list.get("user-agent")?.slice(0, 200) ?? null;
  return {
    ip: clientIp(list.get("x-forwarded-for"), serverEnv().TRUST_PROXY),
    userAgent,
  };
}
