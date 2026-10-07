import "server-only";

import { DomainError } from "@/domains/equipe/actor";

import type { ActionState } from "./action-state";

const MESSAGES: Record<DomainError["code"], string> = {
  not_found: "Cet élément n'est plus accessible.",
  forbidden: "Vous n'avez pas le droit de faire cette modification.",
  vet_limit:
    "Le cabinet compte déjà 3 vétérinaires (invitations en attente comprises).",
  already_member: "Cette adresse appartient déjà à un membre du cabinet.",
  already_invited: "Une invitation est déjà en attente pour cette adresse.",
  invalid_target: "Ce choix n'est plus possible. Rechargez la page.",
  self_action: "Vous ne pouvez pas modifier votre propre accès.",
  last_admin: "Le cabinet doit garder au moins un vétérinaire administrateur.",
  reassignment_required:
    "Choisissez d'abord le vétérinaire qui reprend ses suivis en cours.",
  permission_not_allowed: "Cette permission n'est pas possible pour ce rôle.",
};

/** Traduit un refus métier en message ; toute autre erreur remonte (page d'erreur générique). */
export async function attempt(
  run: () => Promise<unknown>,
  notice: string,
): Promise<ActionState> {
  try {
    await run();
    return { notice };
  } catch (error) {
    if (error instanceof DomainError) return { error: MESSAGES[error.code] };
    throw error;
  }
}
