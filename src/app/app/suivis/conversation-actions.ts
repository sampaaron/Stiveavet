"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { buildSimulatedVoiceNote } from "@/adapters/ai-gateway/simulated-voice";
import { DomainError } from "@/domains/equipe/actor";
import { ownerMessageInput } from "@/domains/conversations/service";
import { MAX_PHOTO_BYTES } from "@/domains/fichiers/media";
import { photoCaptionInput } from "@/domains/fichiers/service";
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

const INVALID: ActionState = { error: "Demande invalide. Rechargez la page." };

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
    return { failure: domainFailure(error) };
  }
}

const followupId = z.uuid();

/** Message de l'équipe au propriétaire : part du WhatsApp du cabinet, met Numa en pause. */
export async function writeToOwnerAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const id = followupId.safeParse(text(form, "followupId"));
  if (!id.success) return INVALID;
  const body = ownerMessageInput.safeParse(text(form, "body"));
  if (!body.success)
    return { error: body.error.issues[0]?.message ?? INVALID.error };
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
  if (!id.success) return INVALID;
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

/** Simulateur : le membre joue le propriétaire et écrit depuis « son » WhatsApp. */
export async function simulateOwnerAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  assertLocal();
  const id = followupId.safeParse(text(form, "followupId"));
  if (!id.success) return INVALID;
  const body = ownerMessageInput.safeParse(text(form, "body"));
  if (!body.success)
    return { error: body.error.issues[0]?.message ?? INVALID.error };
  const context = await memberContext();
  const result = await guarded(async () => {
    await services
      .conversations()
      .simulateOwnerMessage(context, id.data, body.data);
    // Numa répond tout de suite, comme le ferait le worker.
    await services.simulatorWorker().runOnce();
  });
  if ("failure" in result) return result.failure;
  revalidatePath(`/app/suivis/${id.data}`);
  redirect(`/app/suivis/${id.data}/simulateur?fait=envoye`);
}

/** Simulateur : « faire passer le temps » jusqu'aux envois prévus de ce suivi. */
export async function runDueNowAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  assertLocal();
  const id = followupId.safeParse(text(form, "followupId"));
  if (!id.success) return INVALID;
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
  if (!id.success) return INVALID;
  const file = form.get("photo");
  if (!(file instanceof File) || file.size === 0)
    return { error: "Choisissez une photo." };
  if (file.size > MAX_PHOTO_BYTES)
    return { error: "Photo trop lourde : 5 Mo au plus." };
  const caption = photoCaptionInput.safeParse(text(form, "caption"));
  if (!caption.success)
    return { error: caption.error.issues[0]?.message ?? INVALID.error };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const context = await memberContext();
  const result = await guarded(async () => {
    await services.media().simulateOwnerMedia(context, id.data, {
      kind: "photo",
      bytes,
      caption: caption.data,
    });
    await services.simulatorWorker().runOnce();
  });
  if ("failure" in result) return result.failure;
  revalidatePath(`/app/suivis/${id.data}`);
  redirect(`/app/suivis/${id.data}/simulateur?fait=photo`);
}

const spokenInput = z
  .string()
  .trim()
  .min(1, "Écrivez ce que dit le message vocal.")
  .max(1000, "Message vocal trop long (1 000 caractères au plus).");

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
  if (!id.success) return INVALID;
  const spoken = spokenInput.safeParse(text(form, "spoken"));
  if (!spoken.success)
    return { error: spoken.error.issues[0]?.message ?? INVALID.error };
  const context = await memberContext();
  const result = await guarded(async () => {
    await services.media().simulateOwnerMedia(context, id.data, {
      kind: "voice",
      bytes: buildSimulatedVoiceNote(spoken.data),
    });
    // Transcription, puis ce qu'elle déclenche (réponse de Numa, consignes d'urgence).
    await services.simulatorWorker().runOnce();
    await services.simulatorWorker().runOnce();
  });
  if ("failure" in result) return result.failure;
  revalidatePath(`/app/suivis/${id.data}`);
  redirect(`/app/suivis/${id.data}/simulateur?fait=vocal`);
}
