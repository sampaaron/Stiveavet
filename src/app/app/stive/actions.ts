"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { DomainError } from "@/domains/equipe/actor";
import {
  stiveFollowupChoice,
  stiveMessageInput,
} from "@/domains/stive/contexte";
import { appText, uiLocale } from "@/i18n/app/server";
import { memberContext } from "@/server/authz";
import { services } from "@/server/services";

import { domainFailure, invalidRequest } from "../domain-messages";

import type { StiveActionState } from "./state";

/**
 * Conversation avec Stive (ADR 0035). Chaque action refait toute la garde : session, membre
 * actif, permissions relues en base ; le service exige `stive.use` et ne lit un dossier qu'à
 * travers le service des suivis. Le texte d'un message n'apparaît dans aucun journal.
 */

const conversationId = z.uuid();

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

export async function askStiveAction(
  _previous: StiveActionState,
  form: FormData,
): Promise<StiveActionState> {
  const draft = text(form, "message");
  const rawConversation = text(form, "conversationId");
  const conversation = rawConversation
    ? conversationId.safeParse(rawConversation)
    : null;
  if (conversation && !conversation.success) return invalidRequest();
  const followup = stiveFollowupChoice.safeParse(
    text(form, "followup") || "auto",
  );
  if (!followup.success) return invalidRequest();
  const message = stiveMessageInput.safeParse(draft);
  if (!message.success) {
    const { t } = await appText();
    const issue = message.error.issues[0];
    return {
      error:
        issue?.code === "too_big"
          ? t.stive.errors.tooLong
          : t.stive.errors.empty,
      draft,
    };
  }

  const context = await memberContext();
  let result;
  try {
    result = await services.stive().ask(context, {
      conversationId: conversation?.data ?? null,
      message: message.data,
      followup: followup.data,
      language: await uiLocale(),
    });
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    return { ...(await domainFailure(error)), draft };
  }
  if (result.status !== "answered") {
    const { t } = await appText();
    return {
      error:
        result.status === "rate_limited"
          ? t.stive.errors.rateLimited
          : t.stive.errors.unavailable,
      draft,
    };
  }
  revalidatePath("/app/stive");
  redirect(
    `/app/stive?c=${result.conversationId}${result.ambiguous ? "&ambigu=1" : ""}`,
  );
}

export async function deleteStiveConversationAction(
  _previous: StiveActionState,
  form: FormData,
): Promise<StiveActionState> {
  const id = conversationId.safeParse(text(form, "conversationId"));
  if (!id.success) return invalidRequest();
  const context = await memberContext();
  try {
    await services.stive().remove(context, id.data);
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    return domainFailure(error);
  }
  revalidatePath("/app/stive");
  redirect("/app/stive?fait=efface");
}
