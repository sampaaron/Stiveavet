"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { buildSimulatedVoiceNote } from "@/adapters/ai-gateway/simulated-voice";
import { DomainError } from "@/domains/equipe/actor";
import {
  contactRoleInput,
  ownerMessageInput,
} from "@/domains/conversations/service";
import { MAX_PHOTO_BYTES } from "@/domains/fichiers/media";
import { photoCaptionInput } from "@/domains/fichiers/service";
import { appText } from "@/i18n/app/server";
import type { AppDictionary } from "@/i18n/app/types";
import { memberContext } from "@/server/authz";
import { serverEnv } from "@/server/env";
import { services } from "@/server/services";

import type { ActionState } from "../action-state";
import { domainFailure } from "../domain-messages";

/**
 * Conversation d'un suivi (ADR 0016). Chaque action refait toute la garde : session, membre
 * actif, permissions relues en base ; le service vérifie l'accès au dossier, l'accord du
 * propriétaire et le rôle. Le texte d'un message n'apparaît dans aucun journal.
 */

async function invalid(): Promise<ActionState> {
  const { t } = await appText();
  return { error: t.common.invalidRequest };
}

type Validation = AppDictionary["dossier"]["validation"];

/**
 * Message d'un champ refusé, dans la langue de la personne : d'après la nature du refus
 * (trop court, trop long), jamais d'après un texte du domaine.
 */
async function fieldError(
  error: z.ZodError,
  messages: (validation: Validation) => { empty: string; tooLong: string },
): Promise<ActionState> {
  const { t } = await appText();
  const { empty, tooLong } = messages(t.dossier.validation);
  const issue = error.issues[0];
  if (issue?.code === "too_small") return { error: empty };
  if (issue?.code === "too_big") return { error: tooLong };
  return { error: t.common.invalidRequest };
}

const messageError = (error: z.ZodError) =>
  fieldError(error, (v) => ({
    empty: v.emptyMessage,
    tooLong: v.messageTooLong,
  }));

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

async function guarded<T>(
  run: () => Promise<T>,
): Promise<{ ok: T } | { failure: ActionState }> {
  try {
    return { ok: await run() };
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    return { failure: await domainFailure(error) };
  }
}

const followupId = z.uuid();

/** Message de l'équipe au propriétaire : part du WhatsApp du cabinet, met Numa en pause. */
export async function writeToOwnerAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const id = followupId.safeParse(text(form, "followupId"));
  if (!id.success) return invalid();
  const body = ownerMessageInput.safeParse(text(form, "body"));
  if (!body.success) return messageError(body.error);
  const context = await memberContext();
  const result = await guarded(() =>
    services.conversations().writeToOwner(context, id.data, body.data),
  );
  if ("failure" in result) return result.failure;
  revalidatePath(`/app/suivis/${id.data}`);
  redirect(
    `/app/suivis/${id.data}?fait=${result.ok.takeover ? "reprise-en-main" : "message"}#conversation`,
  );
}

/** « Reprendre Numa » après une reprise en main. */
export async function resumeNumaAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const id = followupId.safeParse(text(form, "followupId"));
  if (!id.success) return invalid();
  const context = await memberContext();
  const result = await guarded(() =>
    services.conversations().resumeNuma(context, id.data),
  );
  if ("failure" in result) return result.failure;
  revalidatePath(`/app/suivis/${id.data}`);
  redirect(`/app/suivis/${id.data}?fait=numa#conversation`);
}

/** Simulateur : jamais hors de l'environnement local. */
function assertLocal() {
  if (serverEnv().APP_ENV !== "local") notFound();
}

/** Propriétaire joué dans le simulateur : le principal, ou le second contact (lot 18). */
function simulatedRole(form: FormData) {
  return contactRoleInput.safeParse(text(form, "from") || "primary");
}

function simulatorPage(
  followup: string,
  role: "primary" | "secondary",
  done: string,
) {
  return `/app/suivis/${followup}/simulateur?${role === "secondary" ? "contact=secondary&" : ""}fait=${done}`;
}

/** Simulateur : le membre joue le propriétaire et écrit depuis « son » WhatsApp. */
export async function simulateOwnerAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  assertLocal();
  const id = followupId.safeParse(text(form, "followupId"));
  if (!id.success) return invalid();
  const body = ownerMessageInput.safeParse(text(form, "body"));
  if (!body.success) return messageError(body.error);
  const role = simulatedRole(form);
  if (!role.success) return invalid();
  const context = await memberContext();
  const result = await guarded(async () => {
    await services
      .conversations()
      .simulateOwnerMessage(context, id.data, body.data, role.data);
    // Numa répond tout de suite, comme le ferait le worker.
    await services.simulatorWorker().runOnce();
  });
  if ("failure" in result) return result.failure;
  revalidatePath(`/app/suivis/${id.data}`);
  redirect(simulatorPage(id.data, role.data, "envoye"));
}

/** Simulateur : « faire passer le temps » jusqu'aux envois prévus de ce suivi. */
export async function runDueNowAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  assertLocal();
  const id = followupId.safeParse(text(form, "followupId"));
  if (!id.success) return invalid();
  const context = await memberContext();
  const result = await guarded(async () => {
    await services.conversations().makeDueNow(context, id.data);
    await services.simulatorWorker().runOnce();
  });
  if ("failure" in result) return result.failure;
  revalidatePath(`/app/suivis/${id.data}`);
  redirect(`/app/suivis/${id.data}/simulateur?fait=avance`);
}

/** Simulateur : le propriétaire envoie une photo depuis « son » WhatsApp (lot 16). */
export async function simulateOwnerPhotoAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  assertLocal();
  const id = followupId.safeParse(text(form, "followupId"));
  if (!id.success) return invalid();
  const file = form.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    const { t } = await appText();
    return { error: t.dossier.validation.choosePhoto };
  }
  if (file.size > MAX_PHOTO_BYTES) {
    const { t } = await appText();
    return { error: t.dossier.validation.photoTooLarge };
  }
  const caption = photoCaptionInput.safeParse(text(form, "caption"));
  if (!caption.success)
    return fieldError(caption.error, (v) => ({
      empty: v.captionTooLong,
      tooLong: v.captionTooLong,
    }));
  const role = simulatedRole(form);
  if (!role.success) return invalid();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const context = await memberContext();
  const result = await guarded(async () => {
    await services.media().simulateOwnerMedia(context, id.data, {
      kind: "photo",
      bytes,
      caption: caption.data,
      from: role.data,
    });
    await services.simulatorWorker().runOnce();
  });
  if ("failure" in result) return result.failure;
  revalidatePath(`/app/suivis/${id.data}`);
  redirect(simulatorPage(id.data, role.data, "photo"));
}

const spokenInput = z.string().trim().min(1).max(1000);

/**
 * Simulateur : le propriétaire envoie un message vocal. Le fichier est un vrai son, qui
 * porte le texte « prononcé » pour la transcription simulée (ADR 0019).
 */
export async function simulateOwnerVoiceAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  assertLocal();
  const id = followupId.safeParse(text(form, "followupId"));
  if (!id.success) return invalid();
  const spoken = spokenInput.safeParse(text(form, "spoken"));
  if (!spoken.success)
    return fieldError(spoken.error, (v) => ({
      empty: v.spokenEmpty,
      tooLong: v.spokenTooLong,
    }));
  const role = simulatedRole(form);
  if (!role.success) return invalid();
  const context = await memberContext();
  const result = await guarded(async () => {
    await services.media().simulateOwnerMedia(context, id.data, {
      kind: "voice",
      bytes: buildSimulatedVoiceNote(spoken.data),
      from: role.data,
    });
    // Transcription, puis ce qu'elle déclenche (réponse de Numa, consignes d'urgence).
    await services.simulatorWorker().runOnce();
    await services.simulatorWorker().runOnce();
  });
  if ("failure" in result) return result.failure;
  revalidatePath(`/app/suivis/${id.data}`);
  redirect(simulatorPage(id.data, role.data, "vocal"));
}
