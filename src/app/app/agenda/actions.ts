"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { DomainError } from "@/domains/equipe/actor";
import { MAX_CAPTURE_BYTES } from "@/domains/fichiers/media";
import { memberContext } from "@/server/authz";
import { services } from "@/server/services";

import type { ActionState } from "../action-state";
import { domainFailure } from "../domain-messages";

/**
 * Capture d'agenda et créneaux libres (ADR 0019). Le service vérifie `agenda.capture`, le
 * vétérinaire choisi et le type réel du fichier ; la capture est supprimée dès la lecture.
 */

const INVALID: ActionState = { error: "Demande invalide. Rechargez la page." };

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

export async function importCaptureAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const vet = z.uuid().safeParse(text(form, "vetMembershipId"));
  if (!vet.success) return { error: "Choisissez le vétérinaire concerné." };
  const file = form.get("capture");
  if (!(file instanceof File) || file.size === 0)
    return { error: "Choisissez une capture d'écran." };
  if (file.size > MAX_CAPTURE_BYTES)
    return { error: "Capture trop lourde : 5 Mo au plus." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const context = await memberContext();
  let slotCount: number;
  try {
    ({ slotCount } = await services
      .agenda()
      .importCapture(context, { vetMembershipId: vet.data, bytes }));
  } catch (error) {
    if (error instanceof DomainError) {
      revalidatePath("/app/agenda");
      return domainFailure(error);
    }
    throw error;
  }
  revalidatePath("/app/agenda");
  redirect(`/app/agenda?fait=capture&creneaux=${slotCount}`);
}

export async function removeSlotAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const slot = z.uuid().safeParse(text(form, "slotId"));
  if (!slot.success) return INVALID;
  const context = await memberContext();
  try {
    await services.agenda().removeSlot(context, slot.data);
  } catch (error) {
    if (error instanceof DomainError) return domainFailure(error);
    throw error;
  }
  revalidatePath("/app/agenda");
  redirect("/app/agenda?fait=retire");
}
