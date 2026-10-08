"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { DomainError } from "@/domains/equipe/actor";
import { parisLocalToDate } from "@/domains/reglages/content";
import { sheetInput } from "@/domains/suivis/plan";
import { memberContext } from "@/server/authz";
import { services } from "@/server/services";

import type { ActionState } from "../action-state";
import { domainFailure } from "../domain-messages";

/**
 * Lancement d'un suivi (ADR 0015). Chaque action refait toute la garde : session, membre actif,
 * permissions relues en base ; le service vérifie ensuite l'accès au dossier et le rôle.
 */

const INVALID: ActionState = { error: "Demande invalide. Rechargez la page." };
const MAX_PAYLOAD = 100_000;

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
  if (!ref.success) return INVALID;
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

/** Enregistre la fiche ; « Lancer le suivi » enregistre et lance dans la même transaction. */
export async function saveSheetAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const followupId = z.uuid().safeParse(text(form, "followupId"));
  const intent = z.enum(["save", "launch"]).safeParse(text(form, "intent"));
  const payload = text(form, "payload");
  if (!followupId.success || !intent.success || payload.length > MAX_PAYLOAD)
    return INVALID;
  const parsed = sheetPayload.safeParse(parseJson(payload));
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? INVALID.error };
  const { controlAppointmentAt: control, ...rest } = parsed.data;
  const controlAt = control ? parisLocalToDate(control) : null;
  if (control && !controlAt) return { error: "Date de contrôle invalide." };

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
    {
      invalid_target:
        "Vérifiez la fiche : responsable, date de contrôle après l'intervention et traitements.",
    },
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
      protocolId: z.uuid({ message: "Choisissez un protocole." }),
    })
    .safeParse({
      followupId: text(form, "followupId"),
      protocolId: text(form, "protocolId"),
    });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? INVALID.error };
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
  if (!parsed.success) return INVALID;
  const { followupId, change } = parsed.data;
  const context = await memberContext();
  const failure = await guarded(() =>
    services.launch().changeStatus(context, followupId, change),
  );
  if (failure) return failure;
  revalidatePath("/app/suivis");
  redirect(`/app/suivis/${followupId}?fait=${STATUS_DONE[change]}`);
}
