import "server-only";

import { DomainError } from "@/domains/equipe/actor";
import { appText } from "@/i18n/app/server";

import type { ActionState } from "./action-state";

/** Refus métier traduit dans la langue de la personne (`errors.domain`, ADR 0022). */
export async function domainFailure(error: DomainError): Promise<ActionState> {
  const { t } = await appText();
  return { error: t.errors.domain[error.code] };
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
