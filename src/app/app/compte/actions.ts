"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { passwordChangeInput } from "@/domains/auth/validators";
import { appText } from "@/i18n/app/server";
import { auth } from "@/server/auth";
import { clearAuthCookie, readAuthCookie } from "@/server/auth/cookies";
import { requestOrigin } from "@/server/auth/origin";
import { memberContext } from "@/server/authz";

import type { FormState } from "../../(auth)/form-state";
import { fieldErrors, passwordErrors } from "../../(auth)/messages";
import type { ActionState } from "../action-state";
import { invalidRequest } from "../domain-messages";
import { text } from "../form-data";

/*
 * « Sécurité du compte » : ouvert à tout membre, pour son propre compte seulement. Chaque
 * action passe par la garde serveur (session déverrouillée, membre actif), puis le service
 * n'agit que sur la personne de la session courante.
 */

async function signedOut(): Promise<never> {
  await clearAuthCookie("session");
  redirect("/connexion?raison=session");
}

export async function changePasswordAction(
  _previous: FormState,
  form: FormData,
): Promise<FormState> {
  await memberContext();
  const t = (await appText()).t;
  const parsed = passwordChangeInput.safeParse({
    current: text(form, "current"),
    password: text(form, "password"),
    confirmation: text(form, "confirmation"),
  });
  if (!parsed.success)
    return { fieldErrors: fieldErrors(t.auth, parsed.error) };

  const result = await auth().changePassword(
    {
      sessionToken: await readAuthCookie("session"),
      currentPassword: parsed.data.current,
      password: parsed.data.password,
    },
    await requestOrigin(),
  );
  switch (result.status) {
    case "invalid_current":
      return { fieldErrors: { current: [t.auth.errors.passwordIncorrect] } };
    case "invalid_password":
      return { fieldErrors: passwordErrors(t.auth, result.problems) };
    case "signed_out":
      return signedOut();
    case "changed":
      revalidatePath("/app/compte");
      return { notice: t.account.password.changed };
  }
}

export async function revokeOtherSessionsAction(): Promise<ActionState> {
  await memberContext();
  const { t } = await appText();
  const count = await auth().revokeOtherSessions(
    await readAuthCookie("session"),
  );
  revalidatePath("/app/compte");
  return { notice: t.account.sessions.revoked(count) };
}

const deviceInput = z.object({ id: z.uuid() });

export async function revokeDeviceAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = deviceInput.safeParse({ id: text(form, "id") });
  if (!parsed.success) return invalidRequest();
  await memberContext();
  const { t } = await appText();
  const revoked = await auth().revokeTrustedDevice(
    await readAuthCookie("session"),
    parsed.data.id,
  );
  revalidatePath("/app/compte");
  return revoked
    ? { notice: t.account.devices.revoked }
    : { error: t.account.devices.notFound };
}
