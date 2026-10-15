"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { appText } from "@/i18n/app/server";
import type { AppDictionary } from "@/i18n/app/types";
import { memberContext } from "@/server/authz";
import { services } from "@/server/services";

import type { ActionState } from "../action-state";
import { attempt, invalidRequest } from "../domain-messages";

const role = z.enum(["admin_vet", "vet", "assistant"]);

const inviteInput = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, "email_too_long")
    .pipe(z.email("email_invalid")),
  displayName: z
    .string()
    .trim()
    .min(2, "name_missing")
    .max(120, "name_too_long"),
  role,
});
const idInput = z.object({ id: z.uuid() });
const permissionsInput = z.object({
  membershipId: z.uuid(),
  permissions: z.array(z.string().max(64)).max(32),
});
const roleInput = z.object({ membershipId: z.uuid(), role });
const deactivateInput = z.object({
  membershipId: z.uuid(),
  reassignTo: z.union([z.uuid(), z.literal("")]),
});

type ValidationCode = Exclude<
  keyof AppDictionary["team"]["validation"],
  "fallback"
>;

/** Message d'un contrôle du formulaire d'invitation : code connu, sinon phrase générale. */
function validationMessage(t: AppDictionary, code: string | undefined) {
  const messages = t.team.validation;
  return code && code !== "fallback" && Object.hasOwn(messages, code)
    ? messages[code as ValidationCode]
    : messages.fallback;
}

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * Toutes ces actions passent par la garde serveur (session, membre actif, permissions
 * relues en base) ; le service refuse sans `team.manage` et journalise chaque changement.
 */
async function finish(result: ActionState): Promise<ActionState> {
  revalidatePath("/app/equipe");
  return result;
}

export async function inviteAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = inviteInput.safeParse({
    email: text(form, "email"),
    displayName: text(form, "displayName"),
    role: text(form, "role"),
  });
  const { t } = await appText();
  if (!parsed.success)
    return {
      error: validationMessage(t, parsed.error.issues[0]?.message),
    };
  const context = await memberContext();
  return finish(
    await attempt(
      () => services.team().invite(context, parsed.data),
      t.team.notices.invited,
    ),
  );
}

export async function revokeInvitationAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = idInput.safeParse({ id: text(form, "id") });
  if (!parsed.success) return invalidRequest();
  const [context, { t }] = await Promise.all([memberContext(), appText()]);
  return finish(
    await attempt(
      () => services.team().revokeInvitation(context, parsed.data.id),
      t.team.notices.invitationRevoked,
    ),
  );
}

export async function setPermissionsAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = permissionsInput.safeParse({
    membershipId: text(form, "membershipId"),
    permissions: form
      .getAll("permissions")
      .filter((value) => typeof value === "string"),
  });
  if (!parsed.success) return invalidRequest();
  const [context, { t }] = await Promise.all([memberContext(), appText()]);
  return finish(
    await attempt(
      () =>
        services
          .team()
          .setPermissions(
            context,
            parsed.data.membershipId,
            parsed.data.permissions,
          ),
      t.team.notices.permissionsSaved,
    ),
  );
}

export async function changeRoleAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = roleInput.safeParse({
    membershipId: text(form, "membershipId"),
    role: text(form, "role"),
  });
  if (!parsed.success) return invalidRequest();
  const [context, { t }] = await Promise.all([memberContext(), appText()]);
  return finish(
    await attempt(
      () =>
        services
          .team()
          .changeRole(context, parsed.data.membershipId, parsed.data.role),
      t.team.notices.roleChanged,
    ),
  );
}

export async function deactivateAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = deactivateInput.safeParse({
    membershipId: text(form, "membershipId"),
    reassignTo: text(form, "reassignTo"),
  });
  if (!parsed.success) return invalidRequest();
  const [context, { t }] = await Promise.all([memberContext(), appText()]);
  return finish(
    await attempt(
      () =>
        services
          .team()
          .deactivate(
            context,
            parsed.data.membershipId,
            parsed.data.reassignTo || null,
          ),
      t.team.notices.deactivated,
    ),
  );
}

export async function reactivateAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = idInput.safeParse({ id: text(form, "id") });
  if (!parsed.success) return invalidRequest();
  const [context, { t }] = await Promise.all([memberContext(), appText()]);
  return finish(
    await attempt(
      () => services.team().reactivate(context, parsed.data.id),
      t.team.notices.reactivated,
    ),
  );
}
