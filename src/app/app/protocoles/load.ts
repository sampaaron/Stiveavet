import "server-only";

import { notFound } from "next/navigation";

import { DomainError } from "@/domains/equipe/actor";
import { memberContext } from "@/server/authz";
import { services } from "@/server/services";

/** Protocole lisible, ou 404 (inexistant, autre cabinet, protocole personnel d'un confrère). */
export async function loadProtocol(id: string, versionNumber?: number) {
  const context = await memberContext();
  try {
    return await services.protocols().get(context, id, versionNumber);
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }
}
