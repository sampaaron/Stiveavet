"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { DomainError } from "@/domains/equipe/actor";
import { alertPhoneInput } from "@/domains/whatsapp/numero";
import { appText } from "@/i18n/app/server";
import { memberContext } from "@/server/authz";
import { services } from "@/server/services";

import type { ActionState } from "../action-state";
import { domainFailure } from "../domain-messages";

/**
 * Accusé de réception et clôture d'une alerte (ADR 0017). Le service vérifie l'accès
 * clinique au dossier et le rôle de vétérinaire ; chaque décision est journalisée.
 */

const input = z.object({
  alertId: z.uuid(),
  intent: z.enum(["acknowledge", "resolve", "reassign"]),
  // Destinataire choisi pour « Confier » ; le service vérifie son accès clinique au dossier.
  membershipId: z.uuid().optional(),
  // Retour vers la liste des alertes ou le dossier, jamais vers une adresse libre.
  from: z.enum(["alertes", "dossier"]),
});

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

/** Numéro d'alerte WhatsApp du vétérinaire connecté (vide : retiré). */
export async function alertPhoneAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await appText();
  const phone = text(form, "phone").slice(0, 30);
  if (!alertPhoneInput.safeParse(phone).success)
    return { error: t.alerts.phone.invalid };
  const context = await memberContext();
  try {
    await services.alerts().setAlertPhone(context, phone);
  } catch (error) {
    if (error instanceof DomainError) return domainFailure(error);
    throw error;
  }
  revalidatePath("/app/alertes");
  return { notice: t.alerts.phone.saved };
}

export async function alertAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = input.safeParse({
    alertId: text(form, "alertId"),
    intent: text(form, "intent"),
    membershipId: text(form, "membershipId") || undefined,
    from: text(form, "from"),
  });
  if (!parsed.success) {
    const { t } = await appText();
    return { error: t.common.invalidRequest };
  }
  const { alertId, intent, membershipId, from } = parsed.data;
  const context = await memberContext();
  const service = services.alerts();
  let followupId: string;
  try {
    followupId =
      intent === "acknowledge"
        ? await service.acknowledge(context, alertId)
        : intent === "resolve"
          ? await service.resolve(context, alertId)
          : await service.reassign(context, alertId, membershipId ?? "");
  } catch (error) {
    if (error instanceof DomainError) return domainFailure(error);
    throw error;
  }
  const done = { acknowledge: "recue", resolve: "close", reassign: "confiee" }[
    intent
  ];
  revalidatePath("/app", "layout");
  redirect(
    from === "dossier"
      ? `/app/suivis/${followupId}?fait=alerte-${done}`
      : `/app/alertes?fait=${done}`,
  );
}
