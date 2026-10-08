"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { appText } from "@/i18n/app/server";
import { memberContext } from "@/server/authz";
import { services } from "@/server/services";

import type { ActionState } from "../../action-state";
import { attempt } from "../../domain-messages";

const SHARE_DURATIONS = { illimite: null, "7": 7, "30": 30 } as const;

const shareInput = z.object({
  followupId: z.uuid(),
  membershipId: z.uuid(),
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
const languageInput = z.object({
  followupId: z.uuid(),
  role: z.enum(["primary", "secondary"]),
  language: z.enum(["fr", "en"]),
});

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
  const { t } = await appText();
  const parsed = shareInput.safeParse(
    read(form, ["followupId", "membershipId", "duration"]),
  );
  if (!parsed.success)
    return parsed.error.issues.some((issue) => issue.path[0] === "membershipId")
      ? { error: t.dossier.access.chooseVet }
      : { error: t.common.invalidRequest };
  const { followupId, membershipId, duration } = parsed.data;
  const days = SHARE_DURATIONS[duration];
  const context = await memberContext();
  const result = await attempt(
    () =>
      services.followups().share(context, followupId, {
        membershipId,
        expiresAt: days ? new Date(Date.now() + days * 86_400_000) : null,
      }),
    t.dossier.access.shared,
  );
  revalidatePath(`/app/suivis/${followupId}`);
  return result;
}

export async function revokeShareAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await appText();
  const parsed = revokeInput.safeParse(
    read(form, ["followupId", "membershipId"]),
  );
  if (!parsed.success) return { error: t.common.invalidRequest };
  const context = await memberContext();
  const result = await attempt(
    () =>
      services
        .followups()
        .revokeShare(context, parsed.data.followupId, parsed.data.membershipId),
    t.dossier.access.revoked,
  );
  revalidatePath(`/app/suivis/${parsed.data.followupId}`);
  return result;
}

export async function setPrivateAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await appText();
  const parsed = privacyInput.safeParse(
    read(form, ["followupId", "isPrivate"]),
  );
  if (!parsed.success) return { error: t.common.invalidRequest };
  const isPrivate = parsed.data.isPrivate === "true";
  const context = await memberContext();
  const result = await attempt(
    () =>
      services
        .followups()
        .setPrivate(context, parsed.data.followupId, isPrivate),
    isPrivate ? t.dossier.access.madePrivate : t.dossier.access.madePublic,
  );
  revalidatePath(`/app/suivis/${parsed.data.followupId}`);
  return result;
}

/**
 * Langue de Numa avec un propriétaire, corrigée par un vétérinaire (lot 19). Le service
 * revérifie les droits (réponse aux propriétaires, accès clinique, rôle de vétérinaire) et
 * journalise la correction.
 */
export async function setOwnerLanguageAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await appText();
  const parsed = languageInput.safeParse(
    read(form, ["followupId", "role", "language"]),
  );
  if (!parsed.success) return { error: t.common.invalidRequest };
  const { followupId, role, language } = parsed.data;
  const context = await memberContext();
  const result = await attempt(
    () =>
      services
        .conversations()
        .setOwnerLanguage(context, followupId, { role, language }),
    t.dossier.contacts.languageForm.saved(
      t.dossier.contacts.languageNames[language],
    ),
  );
  revalidatePath(`/app/suivis/${followupId}`);
  return result;
}
