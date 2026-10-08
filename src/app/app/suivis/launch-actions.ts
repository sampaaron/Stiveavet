"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { DomainError } from "@/domains/equipe/actor";
import { parisLocalToDate } from "@/domains/reglages/content";
import { MAX_FIRST_CONTACT_HOURS, sheetInput } from "@/domains/suivis/plan";
import { appText } from "@/i18n/app/server";
import type { AppDictionary } from "@/i18n/app/types";
import { memberContext } from "@/server/authz";
import { services } from "@/server/services";

import type { ActionState } from "../action-state";
import { domainFailure } from "../domain-messages";

/**
 * Lancement d'un suivi (ADR 0015). Chaque action refait toute la garde : session, membre actif,
 * permissions relues en base ; le service vérifie ensuite l'accès au dossier et le rôle.
 */

const MAX_PAYLOAD = 100_000;

async function invalid(): Promise<ActionState> {
  const { t } = await appText();
  return { error: t.common.invalidRequest };
}

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

function parseJson(payload: string): unknown {
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    return null;
  }
}

async function guarded(
  run: () => Promise<void>,
  messages: Partial<Record<DomainError["code"], string>> = {},
): Promise<ActionState | null> {
  try {
    await run();
    return null;
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    const message = messages[error.code];
    return message ? { error: message } : domainFailure(error);
  }
}

/** Crée le brouillon depuis dr.veto puis ouvre la fiche de lancement. */
export async function prepareFollowupAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const ref = z
    .string()
    .regex(/^[A-Za-z0-9-]{3,64}$/)
    .safeParse(text(form, "ref"));
  if (!ref.success) return invalid();
  const context = await memberContext();
  let followupId = "";
  const failure = await guarded(async () => {
    followupId = await services.launch().prepare(context, ref.data);
  });
  if (failure) return failure;
  revalidatePath("/app/suivis");
  redirect(`/app/suivis/${followupId}/lancement`);
}

const sheetPayload = sheetInput.extend({
  controlAppointmentAt: z.string().max(16),
});

/**
 * Message d'un champ refusé de la fiche, dans la langue de la personne. Repéré par le champ et
 * la nature du refus (pas par le texte de la règle) ; les limites viennent du refus lui-même.
 * Un refus imprévu (contenu trafiqué) reçoit le message générique.
 */
function sheetIssueMessage(issue: z.core.$ZodIssue, t: AppDictionary): string {
  const v = t.followups.validation;
  const [field, index, leaf] = issue.path;
  const small = issue.code === "too_small" ? Number(issue.minimum) : null;
  const big = issue.code === "too_big" ? Number(issue.maximum) : null;
  const item = typeof index === "number";
  switch (field) {
    case "firstContactHours":
      if (small !== null) return v.firstContactNegative;
      if (big !== null) return v.firstContactMax(MAX_FIRST_CONTACT_HOURS);
      return v.firstContactInteger;
    case "controlAppointmentAt":
      return v.invalidControl;
    case "steps":
      if (!item)
        return big !== null ? v.tooManySteps(big) : t.common.invalidRequest;
      if (leaf === "offsetHours") {
        if (small !== null) return v.stepNegative;
        if (big !== null) return v.stepMax;
        return v.stepInteger;
      }
      if (leaf === "content" && small !== null) return v.stepShort(small);
      if (leaf === "content" && big !== null) return v.stepLong(big);
      break;
    case "alerts":
      if (!item) {
        if (small !== null) return v.keepOneAlert;
        if (big !== null) return v.tooManyAlerts(big);
        break;
      }
      if (leaf === "description" && small !== null) return v.alertShort(small);
      if (leaf === "description" && big !== null) return v.alertLong(big);
      break;
    case "addTreatments":
      if (!item)
        return big !== null
          ? v.tooManyTreatments(big)
          : t.common.invalidRequest;
      if (leaf === "name" && small !== null) return v.treatmentShort(small);
      if (leaf === "name" && big !== null) return v.treatmentLong(big);
      if (leaf === "instructions" && small !== null)
        return v.instructionsShort(small);
      if (leaf === "instructions" && big !== null)
        return v.instructionsLong(big);
      break;
  }
  return t.common.invalidRequest;
}

/** Enregistre la fiche ; « Lancer le suivi » enregistre et lance dans la même transaction. */
export async function saveSheetAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const followupId = z.uuid().safeParse(text(form, "followupId"));
  const intent = z.enum(["save", "launch"]).safeParse(text(form, "intent"));
  const payload = text(form, "payload");
  if (!followupId.success || !intent.success || payload.length > MAX_PAYLOAD)
    return invalid();
  const { t } = await appText();
  const parsed = sheetPayload.safeParse(parseJson(payload));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      error: issue ? sheetIssueMessage(issue, t) : t.common.invalidRequest,
    };
  }
  const { controlAppointmentAt: control, ...rest } = parsed.data;
  const controlAt = control ? parisLocalToDate(control) : null;
  if (control && !controlAt)
    return { error: t.followups.validation.invalidControl };

  const context = await memberContext();
  const launch = intent.data === "launch";
  const failure = await guarded(
    () =>
      services
        .launch()
        .save(
          context,
          followupId.data,
          { ...rest, controlAppointmentAt: controlAt },
          { launch },
        ),
    { invalid_target: t.followups.validation.invalidSheet },
  );
  if (failure) return failure;
  revalidatePath("/app/suivis");
  revalidatePath(`/app/suivis/${followupId.data}`);
  redirect(
    launch
      ? `/app/suivis/${followupId.data}?fait=lance`
      : `/app/suivis/${followupId.data}/lancement?fait=enregistre`,
  );
}

/** Brouillon : change de protocole (étapes et signes d'alerte repartent de sa version). */
export async function applyProtocolAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      followupId: z.uuid(),
      protocolId: z.uuid(),
    })
    .safeParse({
      followupId: text(form, "followupId"),
      protocolId: text(form, "protocolId"),
    });
  if (!parsed.success) {
    const { t } = await appText();
    const protocol = parsed.error.issues[0]?.path[0] === "protocolId";
    return {
      error: protocol
        ? t.followups.validation.chooseProtocol
        : t.common.invalidRequest,
    };
  }
  const context = await memberContext();
  const failure = await guarded(() =>
    services
      .launch()
      .applyProtocol(context, parsed.data.followupId, parsed.data.protocolId),
  );
  if (failure) return failure;
  redirect(`/app/suivis/${parsed.data.followupId}/lancement?fait=protocole`);
}

const STATUS_DONE = {
  pause: "pause",
  resume: "reprise",
  stop: "arret",
  reactivate: "reactivation",
} as const;

/** Pause, reprise, arrêt ou réactivation, depuis le dossier. */
export async function changeStatusAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      followupId: z.uuid(),
      change: z.enum(["pause", "resume", "stop", "reactivate"]),
    })
    .safeParse({
      followupId: text(form, "followupId"),
      change: text(form, "change"),
    });
  if (!parsed.success) return invalid();
  const { followupId, change } = parsed.data;
  const context = await memberContext();
  const failure = await guarded(() =>
    services.launch().changeStatus(context, followupId, change),
  );
  if (failure) return failure;
  revalidatePath("/app/suivis");
  redirect(`/app/suivis/${followupId}?fait=${STATUS_DONE[change]}`);
}
