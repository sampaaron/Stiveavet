"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { DomainError } from "@/domains/equipe/actor";
import { stiveQuestion } from "@/domains/stive/service";
import { appText } from "@/i18n/app/server";
import { memberContext } from "@/server/authz";
import { services } from "@/server/services";

import type { ActionState } from "../action-state";
import { domainFailure, invalidRequest } from "../domain-messages";

/**
 * Stive (ADR 0034). Chaque action refait toute la garde : session, membre actif, permissions
 * relues en base ; le service vérifie ensuite `stive.use`, la limite du mois et, à la
 * confirmation d'une carte, les droits de l'action elle-même. La question n'apparaît dans
 * aucun journal.
 */

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

const contextId = z.union([z.literal(""), z.uuid()]);

/** Une demande à Stive ; la réponse s'affiche en bas de la conversation. */
export async function askStiveAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t, locale } = await appText();
  const question = stiveQuestion.safeParse(text(form, "question"));
  if (!question.success)
    return {
      error:
        question.error.issues[0]?.code === "too_big"
          ? t.stive.ask.tooLong
          : t.stive.ask.empty,
    };
  const followupId = contextId.safeParse(text(form, "followupId"));
  if (!followupId.success) return invalidRequest();
  const context = await memberContext();
  try {
    await services
      .stive()
      .ask(
        context,
        { question: question.data, followupId: followupId.data },
        { locale },
      );
  } catch (error) {
    if (error instanceof DomainError) return domainFailure(error);
    throw error;
  }
  revalidatePath("/app/stive");
  redirect(
    `/app/stive${followupId.data ? `?suivi=${followupId.data}` : ""}#derniere-reponse`,
  );
}

const decisionInput = z.object({
  proposalId: z.uuid(),
  decision: z.enum(["confirm", "decline"]),
});

/** Clic sur une carte « À confirmer » : l'action de l'écran concerné, revérifiée. */
export async function decideStiveAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = decisionInput.safeParse({
    proposalId: text(form, "proposalId"),
    decision: text(form, "decision"),
  });
  if (!parsed.success) return invalidRequest();
  const { t } = await appText();
  const context = await memberContext();
  try {
    const outcome = await services
      .stive()
      .decide(context, parsed.data.proposalId, parsed.data.decision);
    revalidatePath("/app", "layout");
    return { notice: t.stive.card.outcomes[outcome] };
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    revalidatePath("/app/stive");
    return domainFailure(error);
  }
}

/** « Effacer mes échanges » : ceux de la personne connectée, et eux seuls. */
export async function clearStiveAction(): Promise<ActionState> {
  const context = await memberContext();
  await services.stive().clear(context);
  revalidatePath("/app/stive");
  redirect("/app/stive?fait=efface");
}
