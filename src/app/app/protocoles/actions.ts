"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { DomainError } from "@/domains/equipe/actor";
import { protocolContentInput } from "@/domains/protocoles/content";
import { appText } from "@/i18n/app/server";
import { memberContext } from "@/server/authz";
import { services } from "@/server/services";

import type { ActionState } from "../action-state";
import { attempt, domainFailure } from "../domain-messages";

import { protocolIssueMessage } from "./validation";

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
    changeNote: z.string().trim().max(500, "change_note_long"),
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
  const { t } = await appText();
  const parsed = saveInput.safeParse({
    mode: text(form, "mode"),
    scope: text(form, "scope") || undefined,
    protocolId: text(form, "protocolId") || undefined,
    changeNote: text(form, "changeNote"),
    payload: text(form, "payload"),
  });
  if (!parsed.success)
    return {
      // Seule la note de version est saisie ici ; le reste vient de la page elle-même.
      error:
        parsed.error.issues[0]?.message === "change_note_long"
          ? t.protocols.validation.change_note_long
          : t.common.invalidRequest,
    };
  const content = protocolContentInput.safeParse(
    parseJson(parsed.data.payload),
  );
  if (!content.success)
    return {
      error: protocolIssueMessage(t, content.error.issues[0]?.message),
    };

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
    if (error instanceof DomainError) return await domainFailure(error);
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
  const { t } = await appText();
  if (!key.success) return { error: t.common.invalidRequest };
  const context = await memberContext();
  const result = await attempt(
    () => services.protocols().installFromLibrary(context, key.data),
    t.protocols.library.installed,
  );
  revalidatePath("/app/protocoles");
  return result;
}

export async function validateProtocolAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await appText();
  const parsed = idInput.safeParse({ protocolId: text(form, "protocolId") });
  if (!parsed.success) return { error: t.common.invalidRequest };
  const context = await memberContext();
  const result = await attempt(
    () => services.protocols().validate(context, parsed.data.protocolId),
    t.protocols.actions.validated,
  );
  revalidatePath(`/app/protocoles/${parsed.data.protocolId}`);
  return result;
}

export async function archiveProtocolAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await appText();
  const parsed = idInput
    .extend({ archived: z.enum(["true", "false"]) })
    .safeParse({
      protocolId: text(form, "protocolId"),
      archived: text(form, "archived"),
    });
  if (!parsed.success) return { error: t.common.invalidRequest };
  const archived = parsed.data.archived === "true";
  const context = await memberContext();
  const result = await attempt(
    () =>
      services
        .protocols()
        .setArchived(context, parsed.data.protocolId, archived),
    archived
      ? t.protocols.actions.archivedNotice
      : t.protocols.actions.restoredNotice,
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
  const { t } = await appText();
  const parsed = idInput.extend({ scope }).safeParse({
    protocolId: text(form, "protocolId"),
    scope: text(form, "scope"),
  });
  if (!parsed.success) return { error: t.common.invalidRequest };
  const context = await memberContext();
  let copyId: string;
  try {
    copyId = await services
      .protocols()
      .duplicate(context, parsed.data.protocolId, parsed.data.scope);
  } catch (error) {
    if (error instanceof DomainError) return await domainFailure(error);
    throw error;
  }
  revalidatePath("/app/protocoles");
  redirect(`/app/protocoles/${copyId}/modifier`);
}
