"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { DomainError } from "@/domains/commun/actor";
import { MAX_DOCUMENT_BYTES, documentInput } from "@/domains/documents/service";
import { appText } from "@/i18n/app/server";
import { memberContext } from "@/server/authz";
import { services } from "@/server/services";

import type { ActionState } from "../action-state";
import { domainFailure, invalidRequest } from "../domain-messages";
import { text } from "../form-data";

/**
 * Documents du cabinet (ADR 0045). Le service vérifie `protocols.manage`, le type réel du
 * fichier et la taille ; l'action ne fait que lire le formulaire et traduire les refus.
 */

export async function addDocumentAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await appText();
  const messages = t.hub.documents.validation;
  const parsed = documentInput.safeParse({
    title: text(form, "title"),
    category: text(form, "category"),
  });
  if (!parsed.success)
    return {
      error:
        parsed.error.issues[0]?.path[0] === "category"
          ? messages.category
          : messages.title,
    };
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { error: messages.file };
  if (file.size > MAX_DOCUMENT_BYTES) return { error: messages.tooLarge };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const context = await memberContext();
  try {
    await services.documents().add(context, { ...parsed.data, bytes });
  } catch (error) {
    if (error instanceof DomainError)
      return error.code === "invalid_file"
        ? { error: messages.type }
        : domainFailure(error);
    throw error;
  }
  revalidatePath("/app/documents");
  redirect("/app/documents?fait=ajout");
}

export async function removeDocumentAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const document = z.uuid().safeParse(text(form, "documentId"));
  if (!document.success) return invalidRequest();
  const context = await memberContext();
  try {
    await services.documents().remove(context, document.data);
  } catch (error) {
    if (error instanceof DomainError) return domainFailure(error);
    throw error;
  }
  revalidatePath("/app/documents");
  redirect("/app/documents?fait=suppression");
}
