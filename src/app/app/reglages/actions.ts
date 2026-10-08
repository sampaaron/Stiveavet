"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { DomainError } from "@/domains/equipe/actor";
import {
  EMERGENCY_PERIODS,
  ESCALATION_CHOICES,
  WEEKDAYS,
  appointmentDurationsInput,
  contactInput,
  instructionsInput,
  messageWindowsInput,
  parisLocalToDate,
} from "@/domains/reglages/content";
import { memberContext } from "@/server/authz";
import { services } from "@/server/services";

import type { ActionState } from "../action-state";
import { attempt, domainFailure } from "../domain-messages";

const INVALID: ActionState = { error: "Demande invalide. Rechargez la page." };

const idInput = z.object({ id: z.uuid() });
const periodInput = z.object({
  period: z.enum(EMERGENCY_PERIODS),
  instructions: instructionsInput,
});
const alertsInput = z.object({
  escalationDelayMinutes: z.coerce
    .number()
    .pipe(z.union(ESCALATION_CHOICES.map((value) => z.literal(value)))),
  photoAnalysisEnabled: z.boolean(),
});
const onCallInput = z.object({
  membershipId: z.uuid("Choisissez le vétérinaire de garde."),
  startsAt: z.string().max(16),
  endsAt: z.string().max(16),
});
const providerInput = z.enum(["whatsapp", "drveto", "payment_mandate"]);

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

function firstIssue(error: z.ZodError): ActionState {
  return { error: error.issues[0]?.message ?? INVALID.error };
}

/**
 * Chaque action repasse par la garde serveur (session, membre actif, permissions relues en
 * base) ; le service refuse sans `organization.settings` et journalise chaque changement.
 */
async function finish(result: ActionState): Promise<ActionState> {
  revalidatePath("/app/reglages");
  revalidatePath("/app/demarrage");
  return result;
}

export async function applyDefaultsAction(): Promise<ActionState> {
  const context = await memberContext();
  return finish(
    await attempt(
      () => services.settings().applyDefaults(context),
      "Réglages de départ appliqués. Vous pouvez les adapter à tout moment.",
    ),
  );
}

export async function saveMessageWindowsAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const windows = WEEKDAYS.filter((day) => form.get(`day-${day}`) === "on").map(
    (weekday) => ({
      weekday,
      startsAt: text(form, `start-${weekday}`),
      endsAt: text(form, `end-${weekday}`),
    }),
  );
  const parsed = messageWindowsInput.safeParse(windows);
  if (!parsed.success) return firstIssue(parsed.error);
  const context = await memberContext();
  return finish(
    await attempt(
      () => services.settings().saveMessageWindows(context, parsed.data),
      "Horaires d'envoi enregistrés.",
    ),
  );
}

export async function saveAppointmentWindowsAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const windows = WEEKDAYS.filter((day) => form.get(`day-${day}`) === "on").map(
    (weekday) => ({
      weekday,
      startsAt: text(form, `start-${weekday}`),
      endsAt: text(form, `end-${weekday}`),
    }),
  );
  const parsed = messageWindowsInput.safeParse(windows);
  if (!parsed.success) return firstIssue(parsed.error);
  const context = await memberContext();
  return finish(
    await attempt(
      () => services.settings().saveAppointmentWindows(context, parsed.data),
      "Plages de rendez-vous enregistrées.",
    ),
  );
}

export async function saveAppointmentDurationsAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const minutes = (name: string) => {
    const value = text(form, name);
    return /^\d{1,3}$/.test(value) ? Number(value) : Number.NaN;
  };
  const parsed = appointmentDurationsInput.safeParse({
    post_op_control: minutes("post_op_control"),
    emergency: minutes("emergency"),
    treatment_followup: minutes("treatment_followup"),
    other: minutes("other"),
  });
  if (!parsed.success) return firstIssue(parsed.error);
  const context = await memberContext();
  return finish(
    await attempt(
      () => services.settings().saveAppointmentDurations(context, parsed.data),
      "Durées des rendez-vous enregistrées.",
    ),
  );
}

export async function saveInstructionsAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = periodInput.safeParse({
    period: text(form, "period"),
    instructions: text(form, "instructions"),
  });
  if (!parsed.success) return firstIssue(parsed.error);
  const context = await memberContext();
  return finish(
    await attempt(
      () =>
        services
          .settings()
          .saveInstructions(
            context,
            parsed.data.period,
            parsed.data.instructions,
          ),
      "Consignes enregistrées.",
    ),
  );
}

export async function addContactAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = contactInput.safeParse({
    label: text(form, "label"),
    phone: text(form, "phone"),
  });
  if (!parsed.success) return firstIssue(parsed.error);
  const context = await memberContext();
  return finish(
    await attempt(
      () => services.settings().addContact(context, parsed.data),
      "Contact d'urgence ajouté.",
    ),
  );
}

export async function removeContactAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = idInput.safeParse({ id: text(form, "id") });
  if (!parsed.success) return INVALID;
  const context = await memberContext();
  return finish(
    await attempt(
      () => services.settings().removeContact(context, parsed.data.id),
      "Contact retiré.",
    ),
  );
}

export async function saveAlertSettingsAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = alertsInput.safeParse({
    escalationDelayMinutes: text(form, "escalationDelayMinutes"),
    photoAnalysisEnabled: form.get("photoAnalysisEnabled") === "on",
  });
  if (!parsed.success) return INVALID;
  const context = await memberContext();
  return finish(
    await attempt(
      () => services.settings().saveAlertSettings(context, parsed.data),
      "Règles d'alerte enregistrées.",
    ),
  );
}

export async function addOnCallAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = onCallInput.safeParse({
    membershipId: text(form, "membershipId"),
    startsAt: text(form, "startsAt"),
    endsAt: text(form, "endsAt"),
  });
  if (!parsed.success) return firstIssue(parsed.error);
  const startsAt = parisLocalToDate(parsed.data.startsAt);
  const endsAt = parisLocalToDate(parsed.data.endsAt);
  if (!startsAt || !endsAt)
    return { error: "Indiquez le début et la fin de la garde." };
  if (endsAt <= startsAt)
    return { error: "La fin de la garde doit suivre son début." };
  if (endsAt.getTime() <= Date.now())
    return { error: "Cette garde est déjà terminée." };
  if (endsAt.getTime() - startsAt.getTime() > 14 * 86_400_000)
    return { error: "Une garde dure au plus 14 jours." };
  const context = await memberContext();
  return finish(
    await attempt(
      () =>
        services.settings().addOnCall(context, {
          membershipId: parsed.data.membershipId,
          startsAt,
          endsAt,
        }),
      "Garde ajoutée au planning.",
    ),
  );
}

export async function removeOnCallAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = idInput.safeParse({ id: text(form, "id") });
  if (!parsed.success) return INVALID;
  const context = await memberContext();
  return finish(
    await attempt(
      () => services.settings().removeOnCall(context, parsed.data.id),
      "Garde retirée du planning.",
    ),
  );
}

export async function connectAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const provider = providerInput.safeParse(text(form, "provider"));
  if (!provider.success) return INVALID;
  const value = text(form, "value").slice(0, 64);
  if (provider.data === "whatsapp") {
    const phone = contactInput.shape.phone.safeParse(value);
    if (!phone.success) return firstIssue(phone.error);
  }
  if (provider.data === "drveto" && !/^[A-Za-z0-9-]{3,32}$/.test(value.trim()))
    return {
      error: "Code du cabinet dr.veto : 3 à 32 lettres, chiffres ou tirets.",
    };
  const context = await memberContext();
  return finish(
    await attempt(
      () => services.settings().connect(context, provider.data, value),
      "Connexion simulée enregistrée.",
    ),
  );
}

export async function disconnectAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const provider = providerInput.safeParse(text(form, "provider"));
  if (!provider.success) return INVALID;
  const context = await memberContext();
  return finish(
    await attempt(
      () => services.settings().disconnect(context, provider.data),
      "Connexion retirée.",
    ),
  );
}

export async function completeTeamStepAction(): Promise<ActionState> {
  const context = await memberContext();
  return finish(
    await attempt(
      () => services.settings().completeStep(context, "team"),
      "Étape équipe terminée.",
    ),
  );
}

/** Crée le suivi test puis ouvre son dossier. */
export async function createTestFollowupAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = idInput.safeParse({ id: text(form, "protocolId") });
  if (!parsed.success) return { error: "Choisissez un protocole validé." };
  const context = await memberContext();
  let followupId: string;
  try {
    followupId = await services
      .settings()
      .createTestFollowup(context, parsed.data.id);
  } catch (error) {
    if (error instanceof DomainError) return domainFailure(error);
    throw error;
  }
  revalidatePath("/app/demarrage");
  revalidatePath("/app/suivis");
  redirect(`/app/suivis/${followupId}`);
}
