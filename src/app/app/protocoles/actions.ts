"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { DomainError } from "@/domains/equipe/actor";
import { protocolContentInput } from "@/domains/protocoles/content";
import { memberContext } from "@/server/authz";
import { services } from "@/server/services";

import type { ActionState } from "../action-state";
import { attempt, domainFailure } from "../domain-messages";

const INVALID: ActionState = { error: "Demande invalide. Rechargez la page." };
const MAX_PAYLOAD = 100_000;

const scope = z.enum(["cabinet", "personal"]);
const saveInput = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("create"),
    scope,
    payload: z.string().max(MAX_PAYLOAD),
  }),
  z.object({
    mode: z.literal("update"),
    protocolId: z.uuid(),
    changeNote: z
      .string()
      .trim()
      .max(500, "Note de version : 500 caractères maximum."),
    payload: z.string().max(MAX_PAYLOAD),
  }),
]);
const idInput = z.object({ protocolId: z.uuid() });

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

/** Création ou nouvelle version : le contenu est revalidé ici puis par le service. */
export async function saveProtocolAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = saveInput.safeParse({
    mode: text(form, "mode"),
    scope: text(form, "scope") || undefined,
    protocolId: text(form, "protocolId") || undefined,
    changeNote: text(form, "changeNote"),
    payload: text(form, "payload"),
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? INVALID.error };
  const content = protocolContentInput.safeParse(
    parseJson(parsed.data.payload),
  );
  if (!content.success)
    return { error: content.error.issues[0]?.message ?? INVALID.error };

  const context = await memberContext();
  const protocols = services.protocols();
  let protocolId: string;
  try {
    if (parsed.data.mode === "create") {
      protocolId = await protocols.create(
        context,
        parsed.data.scope,
        content.data,
      );
    } else {
      protocolId = parsed.data.protocolId;
      await protocols.update(
        context,
        protocolId,
        content.data,
        parsed.data.changeNote,
      );
    }
  } catch (error) {
    if (error instanceof DomainError) return domainFailure(error);
    throw error;
  }
  revalidatePath("/app/protocoles");
  redirect(`/app/protocoles/${protocolId}`);
}

export async function installLibraryAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const key = z
    .string()
    .regex(/^[a-z0-9-]{1,64}$/)
    .safeParse(text(form, "key"));
  if (!key.success) return INVALID;
  const context = await memberContext();
  const result = await attempt(
    () => services.protocols().installFromLibrary(context, key.data),
    "Modèle ajouté. Il reste à valider par un vétérinaire.",
  );
  revalidatePath("/app/protocoles");
  return result;
}

export async function validateProtocolAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = idInput.safeParse({ protocolId: text(form, "protocolId") });
  if (!parsed.success) return INVALID;
  const context = await memberContext();
  const result = await attempt(
    () => services.protocols().validate(context, parsed.data.protocolId),
    "Protocole validé.",
  );
  revalidatePath(`/app/protocoles/${parsed.data.protocolId}`);
  return result;
}

export async function archiveProtocolAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = idInput
    .extend({ archived: z.enum(["true", "false"]) })
    .safeParse({
      protocolId: text(form, "protocolId"),
      archived: text(form, "archived"),
    });
  if (!parsed.success) return INVALID;
  const archived = parsed.data.archived === "true";
  const context = await memberContext();
  const result = await attempt(
    () =>
      services
        .protocols()
        .setArchived(context, parsed.data.protocolId, archived),
    archived ? "Protocole archivé." : "Protocole restauré.",
  );
  revalidatePath(`/app/protocoles/${parsed.data.protocolId}`);
  revalidatePath("/app/protocoles");
  return result;
}

/** Copie de la version courante, puis édition de la copie. */
export async function duplicateProtocolAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = idInput.extend({ scope }).safeParse({
    protocolId: text(form, "protocolId"),
    scope: text(form, "scope"),
  });
  if (!parsed.success) return INVALID;
  const context = await memberContext();
  let copyId: string;
  try {
    copyId = await services
      .protocols()
      .duplicate(context, parsed.data.protocolId, parsed.data.scope);
  } catch (error) {
    if (error instanceof DomainError) return domainFailure(error);
    throw error;
  }
  revalidatePath("/app/protocoles");
  redirect(`/app/protocoles/${copyId}/modifier`);
}
