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
import { appText } from "@/i18n/app/server";
import type { AppDictionary } from "@/i18n/app/types";
import { memberContext } from "@/server/authz";
import { services } from "@/server/services";

import type { ActionState } from "../action-state";
import { attempt, domainFailure } from "../domain-messages";

/** Requête altérée (identifiant, choix fermé) : message générique, sans détail. */
async function invalid(): Promise<ActionState> {
  const { t } = await appText();
  return { error: t.common.invalidRequest };
}

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
  membershipId: z.uuid("on_call_vet_required"),
  startsAt: z.string().max(16),
  endsAt: z.string().max(16),
});
const providerInput = z.enum(["whatsapp", "drveto", "payment_mandate"]);

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

type ValidationCode = keyof AppDictionary["settings"]["validation"];

/** Les schémas renvoient un code ; un message par défaut de Zod devient une phrase générique. */
async function firstIssue(error: z.ZodError): Promise<ActionState> {
  const { t } = await appText();
  const code = error.issues[0]?.message ?? "";
  const known = (value: string): value is ValidationCode =>
    Object.hasOwn(t.settings.validation, value);
  return {
    error: known(code)
      ? t.settings.validation[code]
      : t.settings.errors.invalidInput,
  };
}

/** Texte de confirmation, dans la langue de la personne. */
async function notice(
  pick: (n: AppDictionary["settings"]["notices"]) => string,
): Promise<string> {
  const { t } = await appText();
  return pick(t.settings.notices);
}

/** Saisie refusée par l'action elle-même. */
async function failure(
  pick: (e: AppDictionary["settings"]["errors"]) => string,
): Promise<ActionState> {
  const { t } = await appText();
  return { error: pick(t.settings.errors) };
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
      await notice((n) => n.defaultsApplied),
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
  if (!parsed.success) return await firstIssue(parsed.error);
  const context = await memberContext();
  return finish(
    await attempt(
      () => services.settings().saveMessageWindows(context, parsed.data),
      await notice((n) => n.messageWindowsSaved),
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
  if (!parsed.success) return await firstIssue(parsed.error);
  const context = await memberContext();
  return finish(
    await attempt(
      () => services.settings().saveAppointmentWindows(context, parsed.data),
      await notice((n) => n.appointmentWindowsSaved),
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
  if (!parsed.success) return await firstIssue(parsed.error);
  const context = await memberContext();
  return finish(
    await attempt(
      () => services.settings().saveAppointmentDurations(context, parsed.data),
      await notice((n) => n.durationsSaved),
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
  if (!parsed.success) return await firstIssue(parsed.error);
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
      await notice((n) => n.instructionsSaved),
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
  if (!parsed.success) return await firstIssue(parsed.error);
  const context = await memberContext();
  return finish(
    await attempt(
      () => services.settings().addContact(context, parsed.data),
      await notice((n) => n.contactAdded),
    ),
  );
}

export async function removeContactAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = idInput.safeParse({ id: text(form, "id") });
  if (!parsed.success) return invalid();
  const context = await memberContext();
  return finish(
    await attempt(
      () => services.settings().removeContact(context, parsed.data.id),
      await notice((n) => n.contactRemoved),
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
  if (!parsed.success) return invalid();
  const context = await memberContext();
  return finish(
    await attempt(
      () => services.settings().saveAlertSettings(context, parsed.data),
      await notice((n) => n.alertsSaved),
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
  if (!parsed.success) return await firstIssue(parsed.error);
  const startsAt = parisLocalToDate(parsed.data.startsAt);
  const endsAt = parisLocalToDate(parsed.data.endsAt);
  if (!startsAt || !endsAt) return failure((e) => e.onCallDates);
  if (endsAt <= startsAt) return failure((e) => e.onCallOrder);
  if (endsAt.getTime() <= Date.now()) return failure((e) => e.onCallEnded);
  if (endsAt.getTime() - startsAt.getTime() > 14 * 86_400_000)
    return failure((e) => e.onCallTooLong);
  const context = await memberContext();
  return finish(
    await attempt(
      () =>
        services.settings().addOnCall(context, {
          membershipId: parsed.data.membershipId,
          startsAt,
          endsAt,
        }),
      await notice((n) => n.onCallAdded),
    ),
  );
}

export async function removeOnCallAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = idInput.safeParse({ id: text(form, "id") });
  if (!parsed.success) return invalid();
  const context = await memberContext();
  return finish(
    await attempt(
      () => services.settings().removeOnCall(context, parsed.data.id),
      await notice((n) => n.onCallRemoved),
    ),
  );
}

export async function connectAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const provider = providerInput.safeParse(text(form, "provider"));
  if (!provider.success) return invalid();
  const value = text(form, "value").slice(0, 64);
  if (provider.data === "whatsapp") {
    const phone = contactInput.shape.phone.safeParse(value);
    if (!phone.success) return await firstIssue(phone.error);
  }
  if (provider.data === "drveto" && !/^[A-Za-z0-9-]{3,32}$/.test(value.trim()))
    return failure((e) => e.drvetoCode);
  const context = await memberContext();
  return finish(
    await attempt(
      () => services.settings().connect(context, provider.data, value),
      await notice((n) => n.connected),
    ),
  );
}

/**
 * Fin de l'inscription intégrée de Meta : le code (valable 30 secondes) et les identifiants
 * reçus dans le navigateur, avec le PIN choisi. Le service fait les appels à Meta.
 */
export async function connectWhatsAppAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const pin = text(form, "pin");
  if (!/^[0-9]{6}$/.test(pin)) return failure((e) => e.whatsappPin);
  const context = await memberContext();
  return finish(
    await attempt(
      () =>
        services.settings().connectWhatsApp(context, {
          code: text(form, "code").slice(0, 1024),
          wabaId: text(form, "wabaId").slice(0, 30),
          phoneNumberId: text(form, "phoneNumberId").slice(0, 30),
          pin,
        }),
      await notice((n) => n.connected),
    ),
  );
}

export async function disconnectAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const provider = providerInput.safeParse(text(form, "provider"));
  if (!provider.success) return invalid();
  const context = await memberContext();
  return finish(
    await attempt(
      () => services.settings().disconnect(context, provider.data),
      await notice((n) => n.disconnected),
    ),
  );
}

export async function completeTeamStepAction(): Promise<ActionState> {
  const context = await memberContext();
  return finish(
    await attempt(
      () => services.settings().completeStep(context, "team"),
      await notice((n) => n.teamDone),
    ),
  );
}

/** Crée le suivi test puis ouvre son dossier. */
export async function createTestFollowupAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = idInput.safeParse({ id: text(form, "protocolId") });
  if (!parsed.success) return failure((e) => e.chooseProtocol);
  const context = await memberContext();
  let followupId: string;
  try {
    followupId = await services
      .settings()
      .createTestFollowup(context, parsed.data.id);
  } catch (error) {
    if (error instanceof DomainError) return await domainFailure(error);
    throw error;
  }
  revalidatePath("/app/demarrage");
  revalidatePath("/app/suivis");
  redirect(`/app/suivis/${followupId}`);
}
