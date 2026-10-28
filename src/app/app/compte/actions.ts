"use server";

import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  PASSKEY_POLICY,
  parseResponse,
  passkeyLabel,
  registrationResponse,
} from "@/domains/auth/cles-d-acces";
import { passwordChangeInput, unlockInput } from "@/domains/auth/validators";
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

// Clés d'accès (ADR 0050) : mot de passe à l'appui, puis réponse de l'appareil vérifiée.

const passkeyStartInput = z.object({
  label: passkeyLabel,
  password: unlockInput.shape.password,
});

export type PasskeyStartState = FormState & {
  options?: PublicKeyCredentialCreationOptionsJSON;
};

export async function startPasskeyAction(
  form: FormData,
): Promise<PasskeyStartState> {
  await memberContext();
  const t = (await appText()).t;
  const parsed = passkeyStartInput.safeParse({
    label: text(form, "label"),
    password: text(form, "password"),
  });
  if (!parsed.success)
    return { fieldErrors: fieldErrors(t.auth, parsed.error) };

  const result = await auth().passkeyRegistrationOptions(
    {
      sessionToken: await readAuthCookie("session"),
      password: parsed.data.password,
    },
    await requestOrigin(),
  );
  switch (result.status) {
    case "invalid_password":
      return { fieldErrors: { password: [t.auth.errors.passwordIncorrect] } };
    case "limit":
      return { error: t.account.passkeys.limit(PASSKEY_POLICY.maxPerUser) };
    case "signed_out":
      return signedOut();
    case "options":
      return { options: result.options };
  }
}

export async function finishPasskeyAction(
  label: string,
  response: string,
): Promise<ActionState> {
  await memberContext();
  const { t } = await appText();
  const name = passkeyLabel.safeParse(label);
  const parsed = parseResponse(registrationResponse, response);
  if (!name.success || !parsed) return { error: t.account.passkeys.invalid };
  const result = await auth().registerPasskey({
    sessionToken: await readAuthCookie("session"),
    label: name.data,
    response: parsed,
  });
  switch (result) {
    case "added":
      revalidatePath("/app/compte");
      return { notice: t.account.passkeys.added };
    case "invalid":
      return { error: t.account.passkeys.invalid };
    case "limit":
      return { error: t.account.passkeys.limit(PASSKEY_POLICY.maxPerUser) };
    case "signed_out":
      return signedOut();
  }
}

export async function removePasskeyAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = deviceInput.safeParse({ id: text(form, "id") });
  if (!parsed.success) return invalidRequest();
  await memberContext();
  const { t } = await appText();
  const removed = await auth().removePasskey(
    await readAuthCookie("session"),
    parsed.data.id,
  );
  revalidatePath("/app/compte");
  return removed
    ? { notice: t.account.passkeys.removed }
    : { error: t.account.passkeys.notFound };
}
