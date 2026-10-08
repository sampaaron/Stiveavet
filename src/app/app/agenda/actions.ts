"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { DomainError } from "@/domains/equipe/actor";
import { MAX_CAPTURE_BYTES } from "@/domains/fichiers/media";
import { appText } from "@/i18n/app/server";
import { memberContext } from "@/server/authz";
import { services } from "@/server/services";

import type { ActionState } from "../action-state";
import { domainFailure } from "../domain-messages";

/**
 * Capture d'agenda et créneaux libres (ADR 0019). Le service vérifie `agenda.capture`, le
 * vétérinaire choisi et le type réel du fichier ; la capture est supprimée dès la lecture.
 */

async function invalid(): Promise<ActionState> {
  const { t } = await appText();
  return { error: t.common.invalidRequest };
}

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

export async function importCaptureAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await appText();
  const vet = z.uuid().safeParse(text(form, "vetMembershipId"));
  if (!vet.success) return { error: t.agenda.validation.vet };
  const file = form.get("capture");
  if (!(file instanceof File) || file.size === 0)
    return { error: t.agenda.validation.file };
  if (file.size > MAX_CAPTURE_BYTES)
    return { error: t.agenda.validation.tooLarge };
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
  if (!slot.success) return invalid();
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

const decisionInput = z.object({
  appointmentId: z.uuid(),
  decision: z.enum(["confirm", "decline"]),
});

/** Confirmer ou refuser un créneau choisi par le propriétaire (`appointments.confirm`). */
export async function decideAppointmentAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = decisionInput.safeParse({
    appointmentId: text(form, "appointmentId"),
    decision: text(form, "decision"),
  });
  if (!parsed.success) return invalid();
  const context = await memberContext();
  const { appointmentId, decision } = parsed.data;
  try {
    if (decision === "confirm")
      await services.appointments().confirm(context, appointmentId);
    else await services.appointments().decline(context, appointmentId);
  } catch (error) {
    if (error instanceof DomainError) {
      revalidatePath("/app/agenda");
      return domainFailure(error);
    }
    throw error;
  }
  revalidatePath("/app/agenda");
  revalidatePath("/app");
  redirect(
    `/app/agenda?fait=${decision === "confirm" ? "confirme" : "refuse"}`,
  );
}

/** Le cabinet a rappelé le propriétaire qui demandait un rendez-vous. */
export async function closeCallbackAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const request = z.uuid().safeParse(text(form, "requestId"));
  if (!request.success) return invalid();
  const context = await memberContext();
  try {
    await services.appointments().closeCallback(context, request.data);
  } catch (error) {
    if (error instanceof DomainError) {
      revalidatePath("/app/agenda");
      return domainFailure(error);
    }
    throw error;
  }
  revalidatePath("/app/agenda");
  redirect("/app/agenda?fait=rappele");
}
