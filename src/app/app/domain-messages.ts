import "server-only";

import { DomainError } from "@/domains/equipe/actor";

import type { ActionState } from "./action-state";

const MESSAGES: Record<DomainError["code"], string> = {
  not_found: "Cet élément n'est plus accessible.",
  forbidden: "Vous n'avez pas le droit de faire cette modification.",
  vet_limit:
    "Votre formule est au complet en vétérinaires (invitations en attente comprises). Changez de formule dans Facturation.",
  already_member: "Cette adresse appartient déjà à un membre du cabinet.",
  already_invited: "Une invitation est déjà en attente pour cette adresse.",
  invalid_target: "Ce choix n'est plus possible. Rechargez la page.",
  self_action: "Vous ne pouvez pas modifier votre propre accès.",
  last_admin: "Le cabinet doit garder au moins un vétérinaire administrateur.",
  reassignment_required:
    "Choisissez d'abord le vétérinaire qui reprend ses suivis en cours.",
  permission_not_allowed: "Cette permission n'est pas possible pour ce rôle.",
  already_installed: "Ce modèle est déjà dans les protocoles du cabinet.",
  billing_blocked:
    "Les nouveaux suivis sont suspendus : régularisez le paiement dans Facturation. Les suivis en cours continuent.",
  plan_vet_limit:
    "Cette formule compte moins de vétérinaires que votre équipe actuelle (invitations en attente comprises).",
  on_call_overlap: "Cette garde chevauche une garde déjà prévue.",
  integration_missing:
    "Connectez d'abord dr.veto et le numéro WhatsApp du cabinet dans Réglages.",
  already_followed:
    "Cet animal a déjà un suivi en préparation ou en cours. Ouvrez-le depuis la liste des suivis.",
  launch_incomplete:
    "La fiche n'est pas prête : choisissez un protocole validé et la date du premier message.",
  invalid_transition:
    "Ce suivi a changé d'état entre-temps. Rechargez la page.",
  past_step:
    "Une étape déjà passée ne se modifie plus : choisissez un délai à venir.",
};

export function domainFailure(error: DomainError): ActionState {
  return { error: MESSAGES[error.code] };
}

/** Traduit un refus métier en message ; toute autre erreur remonte (page d'erreur générique). */
export async function attempt(
  run: () => Promise<unknown>,
  notice: string,
): Promise<ActionState> {
  try {
    await run();
    return { notice };
  } catch (error) {
    if (error instanceof DomainError) return domainFailure(error);
    throw error;
  }
}
