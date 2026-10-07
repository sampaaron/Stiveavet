"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { memberContext } from "@/server/authz";
import { services } from "@/server/services";

import type { ActionState } from "../action-state";
import { attempt } from "../domain-messages";

const role = z.enum(["admin_vet", "vet", "assistant"]);

const inviteInput = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, "Adresse trop longue.")
    .pipe(z.email("Adresse e-mail invalide.")),
  displayName: z
    .string()
    .trim()
    .min(2, "Indiquez le nom de la personne.")
    .max(120, "Nom trop long."),
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

const INVALID: ActionState = { error: "Demande invalide. Rechargez la page." };

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
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? INVALID.error };
  const context = await memberContext();
  return finish(
    await attempt(
      () => services.team().invite(context, parsed.data),
      "Invitation envoyée. Le lien est valable 7 jours.",
    ),
  );
}

export async function revokeInvitationAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = idInput.safeParse({ id: text(form, "id") });
  if (!parsed.success) return INVALID;
  const context = await memberContext();
  return finish(
    await attempt(
      () => services.team().revokeInvitation(context, parsed.data.id),
      "Invitation annulée.",
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
  if (!parsed.success) return INVALID;
  const context = await memberContext();
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
      "Droits enregistrés.",
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
  if (!parsed.success) return INVALID;
  const context = await memberContext();
  return finish(
    await attempt(
      () =>
        services
          .team()
          .changeRole(context, parsed.data.membershipId, parsed.data.role),
      "Rôle modifié. Les droits ont repris les valeurs par défaut du rôle.",
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
  if (!parsed.success) return INVALID;
  const context = await memberContext();
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
      "Accès retiré. Ses sessions sont fermées.",
    ),
  );
}

export async function reactivateAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = idInput.safeParse({ id: text(form, "id") });
  if (!parsed.success) return INVALID;
  const context = await memberContext();
  return finish(
    await attempt(
      () => services.team().reactivate(context, parsed.data.id),
      "Accès rétabli.",
    ),
  );
}
