"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { memberContext } from "@/server/authz";
import { services } from "@/server/services";

import type { ActionState } from "../../action-state";
import { attempt } from "../../domain-messages";

const SHARE_DURATIONS = { illimite: null, "7": 7, "30": 30 } as const;

const shareInput = z.object({
  followupId: z.uuid(),
  membershipId: z.uuid({ message: "Choisissez un vétérinaire." }),
  duration: z.enum(["illimite", "7", "30"]),
});
const revokeInput = z.object({
  followupId: z.uuid(),
  membershipId: z.uuid(),
});
const privacyInput = z.object({
  followupId: z.uuid(),
  isPrivate: z.enum(["true", "false"]),
});

const INVALID: ActionState = { error: "Demande invalide. Rechargez la page." };

function read(form: FormData, names: readonly string[]) {
  return Object.fromEntries(names.map((name) => [name, form.get(name)]));
}

/**
 * Chaque action refait toute la garde : session, membre actif, permissions relues en base,
 * puis le service vérifie que l'acteur est bien le vétérinaire responsable du dossier.
 */
export async function shareFollowupAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = shareInput.safeParse(
    read(form, ["followupId", "membershipId", "duration"]),
  );
  if (!parsed.success)
    return parsed.error.issues.some((issue) => issue.path[0] === "membershipId")
      ? { error: "Choisissez un vétérinaire." }
      : INVALID;
  const { followupId, membershipId, duration } = parsed.data;
  const days = SHARE_DURATIONS[duration];
  const context = await memberContext();
  const result = await attempt(
    () =>
      services.followups().share(context, followupId, {
        membershipId,
        expiresAt: days ? new Date(Date.now() + days * 86_400_000) : null,
      }),
    "Dossier partagé.",
  );
  revalidatePath(`/app/suivis/${followupId}`);
  return result;
}

export async function revokeShareAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = revokeInput.safeParse(
    read(form, ["followupId", "membershipId"]),
  );
  if (!parsed.success) return INVALID;
  const context = await memberContext();
  const result = await attempt(
    () =>
      services
        .followups()
        .revokeShare(context, parsed.data.followupId, parsed.data.membershipId),
    "Partage retiré.",
  );
  revalidatePath(`/app/suivis/${parsed.data.followupId}`);
  return result;
}

export async function setPrivateAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = privacyInput.safeParse(
    read(form, ["followupId", "isPrivate"]),
  );
  if (!parsed.success) return INVALID;
  const isPrivate = parsed.data.isPrivate === "true";
  const context = await memberContext();
  const result = await attempt(
    () =>
      services
        .followups()
        .setPrivate(context, parsed.data.followupId, isPrivate),
    isPrivate ? "Dossier rendu privé." : "Dossier visible par le cabinet.",
  );
  revalidatePath(`/app/suivis/${parsed.data.followupId}`);
  return result;
}
