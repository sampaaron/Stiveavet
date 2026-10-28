"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { DomainError } from "@/domains/commun/actor";
import { templateInput } from "@/domains/reponses/service";
import { appText } from "@/i18n/app/server";
import { memberContext } from "@/server/authz";
import { services } from "@/server/services";

import type { ActionState } from "../action-state";
import { domainFailure, invalidRequest } from "../domain-messages";
import { text } from "../form-data";

/**
 * Modèles de réponse (ADR 0048). Le service vérifie le droit de l'administrateur et le
 * plafond ; l'action lit le formulaire et traduit les refus.
 */

async function readTemplate(form: FormData) {
  const { t } = await appText();
  const messages = t.hub.replies.validation;
  const parsed = templateInput.safeParse({
    title: text(form, "title"),
    body: text(form, "body"),
    language: text(form, "language"),
  });
  if (parsed.success) return { data: parsed.data };
  const field = parsed.error.issues[0]?.path[0];
  return {
    error:
      field === "body"
        ? messages.body
        : field === "title"
          ? messages.title
          : t.common.invalidRequest,
  };
}

async function run(
  task: () => Promise<unknown>,
  done: string,
): Promise<ActionState> {
  try {
    await task();
  } catch (error) {
    if (error instanceof DomainError) return domainFailure(error);
    throw error;
  }
  revalidatePath("/app/reponses");
  redirect(`/app/reponses?fait=${done}`);
}

export async function addTemplateAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const input = await readTemplate(form);
  if (!input.data) return { error: input.error };
  const context = await memberContext();
  return run(
    () => services.replyTemplates().create(context, input.data),
    "ajout",
  );
}

export async function saveTemplateAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const id = z.uuid().safeParse(text(form, "templateId"));
  if (!id.success) return invalidRequest();
  const input = await readTemplate(form);
  if (!input.data) return { error: input.error };
  const context = await memberContext();
  return run(
    () => services.replyTemplates().update(context, id.data, input.data),
    "enregistre",
  );
}

export async function removeTemplateAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const id = z.uuid().safeParse(text(form, "templateId"));
  if (!id.success) return invalidRequest();
  const context = await memberContext();
  return run(
    () => services.replyTemplates().remove(context, id.data),
    "suppression",
  );
}
