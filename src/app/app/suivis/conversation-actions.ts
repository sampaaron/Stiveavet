"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { DomainError } from "@/domains/equipe/actor";
import { ownerMessageInput } from "@/domains/conversations/service";
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
