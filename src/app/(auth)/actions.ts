"use server";

import { redirect } from "next/navigation";
import type { z } from "zod";

import {
  codeInput,
  invitationInput,
  loginInput,
  newPasswordInput,
  resetRequestInput,
  signupInput,
  unlockInput,
} from "@/domains/auth/validators";
import { hashPassword, passwordProblems } from "@/domains/auth/password";
import { acceptInvitation, previewInvitation } from "@/domains/equipe/service";
import { auth } from "@/server/auth";
import {
  clearAuthCookie,
  readAuthCookie,
  setChallengeCookie,
  setDeviceCookie,
  setSessionCookie,
} from "@/server/auth/cookies";
import { requestOrigin } from "@/server/auth/origin";
import { appDatabase } from "@/server/db/client";

import type { FormState } from "./form-state";

const GENERIC_LOGIN_ERROR = "Adresse e-mail ou mot de passe incorrect.";
const RATE_LIMITED =
  "Trop de tentatives. Patientez quelques minutes avant de réessayer.";

function fields(form: FormData, names: readonly string[]) {
  return Object.fromEntries(
    names.map((name) => {
      const value = form.get(name);
      return [name, typeof value === "string" ? value : ""];
    }),
  );
}

function fieldErrors(error: z.ZodError): FormState["fieldErrors"] {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    (result[key] ??= []).push(issue.message);
  }
  return result;
}

export async function loginAction(
  _previous: FormState,
  form: FormData,
): Promise<FormState> {
  const parsed = loginInput.safeParse(fields(form, ["email", "password"]));
  const values = { email: String(form.get("email") ?? "").slice(0, 254) };
  if (!parsed.success)
    return { fieldErrors: fieldErrors(parsed.error), values };

  const result = await auth().login(
    { ...parsed.data, deviceToken: await readAuthCookie("device") },
    await requestOrigin(),
  );
  switch (result.status) {
    case "invalid":
      return { error: GENERIC_LOGIN_ERROR, values };
    case "rate_limited":
      return { error: RATE_LIMITED, values };
    case "code_required":
      await setChallengeCookie(result.challengeToken);
      return redirect("/connexion/code");
    case "signed_in":
      await setSessionCookie(result.sessionToken, result.sessionExpiresAt);
      return redirect("/app");
  }
}

export async function verifyCodeAction(
  _previous: FormState,
  form: FormData,
): Promise<FormState> {
  const parsed = codeInput.safeParse(fields(form, ["code"]));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const result = await auth().verifyCode(
    {
      challengeToken: await readAuthCookie("challenge"),
      code: parsed.data.code,
    },
    await requestOrigin(),
  );
  // Code faux et code expiré reçoivent la même réponse : l'écran ne révèle rien
  // (notamment pas qu'une inscription visait une adresse déjà enregistrée).
  if (result.status !== "signed_in")
    return {
      fieldErrors: {
        code: [
          "Code incorrect ou expiré. Vérifiez le dernier e-mail reçu, ou reconnectez-vous pour recevoir un nouveau code.",
        ],
      },
    };
  await clearAuthCookie("challenge");
  await setSessionCookie(result.sessionToken, result.sessionExpiresAt);
  if (result.deviceToken) await setDeviceCookie(result.deviceToken);
  // Après l'inscription, le cabinet arrive directement dans l'installation guidée (cahier §14).
  redirect(form.get("origine") === "inscription" ? "/app/demarrage" : "/app");
}

export async function unlockAction(
  _previous: FormState,
  form: FormData,
): Promise<FormState> {
  const parsed = unlockInput.safeParse(fields(form, ["password"]));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const outcome = await auth().unlock(
    {
      sessionToken: await readAuthCookie("session"),
      password: parsed.data.password,
    },
    await requestOrigin(),
  );
  if (outcome === "invalid")
    return { fieldErrors: { password: ["Mot de passe incorrect."] } };
  if (outcome === "signed_out") {
    await clearAuthCookie("session");
    redirect("/connexion?raison=session");
  }
  redirect("/app");
}

export async function requestResetAction(
  _previous: FormState,
  form: FormData,
): Promise<FormState> {
  const parsed = resetRequestInput.safeParse(fields(form, ["email"]));
  const values = { email: String(form.get("email") ?? "").slice(0, 254) };
  if (!parsed.success)
    return { fieldErrors: fieldErrors(parsed.error), values };

  const outcome = await auth().requestPasswordReset(
    parsed.data,
    await requestOrigin(),
  );
  if (outcome === "rate_limited") return { error: RATE_LIMITED, values };
  return {
    notice:
      "Si un compte existe pour cette adresse, un lien de réinitialisation vient d'être envoyé. Il est valable 30 minutes.",
  };
}

export async function resetPasswordAction(
  _previous: FormState,
  form: FormData,
): Promise<FormState> {
  const parsed = newPasswordInput.safeParse(
    fields(form, ["token", "password", "confirmation"]),
  );
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const result = await auth().resetPassword(
    { token: parsed.data.token, password: parsed.data.password },
    await requestOrigin(),
  );
  if (result.status === "invalid_password")
    return { fieldErrors: { password: result.problems } };
  if (result.status === "expired")
    return {
      error:
        "Ce lien n'est plus valable. Demandez-en un nouveau depuis « Mot de passe oublié ».",
    };
  await clearAuthCookie("session");
  redirect("/connexion?raison=mot-de-passe");
}

export async function signupAction(
  _previous: FormState,
  form: FormData,
): Promise<FormState> {
  const raw = fields(form, [
    "organizationName",
    "displayName",
    "email",
    "plan",
    "password",
    "confirmation",
    "acceptTerms",
    "authorized",
  ]);
  const values = {
    organizationName: raw.organizationName?.slice(0, 160),
    displayName: raw.displayName?.slice(0, 120),
    email: raw.email?.slice(0, 254),
    plan: raw.plan?.slice(0, 16),
    acceptTerms: raw.acceptTerms === "on" ? "on" : "",
    authorized: raw.authorized === "on" ? "on" : "",
  };
  const parsed = signupInput.safeParse(raw);
  if (!parsed.success)
    return { fieldErrors: fieldErrors(parsed.error), values };

  const result = await auth().register(parsed.data, await requestOrigin());
  switch (result.status) {
    case "invalid_password":
      return { fieldErrors: { password: result.problems }, values };
    case "rate_limited":
      return { error: RATE_LIMITED, values };
    case "code_required":
      await setChallengeCookie(result.challengeToken);
      return redirect("/connexion/code?origine=inscription");
  }
}

export async function lockAction(): Promise<void> {
  await auth().lock(await readAuthCookie("session"));
  redirect("/verrouillage");
}

export async function logoutAction(): Promise<void> {
  await auth().logout(await readAuthCookie("session"));
  await clearAuthCookie("session");
  redirect("/connexion?raison=deconnexion");
}

/** Activité dans la page sans requête serveur (saisie longue) : repousse le verrouillage. */
export async function keepAliveAction(): Promise<
  "active" | "locked" | "signed_out"
> {
  const session = await auth().resolveSession(await readAuthCookie("session"));
  if (!session) return "signed_out";
  return session.locked ? "locked" : "active";
}

const INVITATION_EXPIRED =
  "Cette invitation n'est plus valable. Demandez une nouvelle invitation au cabinet.";

/** Création du compte d'une personne invitée ; elle se connecte ensuite normalement. */
export async function acceptInvitationAction(
  _previous: FormState,
  form: FormData,
): Promise<FormState> {
  const raw = fields(form, [
    "token",
    "displayName",
    "password",
    "confirmation",
  ]);
  const values = { displayName: raw.displayName?.slice(0, 120) };
  const parsed = invitationInput.safeParse(raw);
  if (!parsed.success)
    return { fieldErrors: fieldErrors(parsed.error), values };

  const db = appDatabase();
  // Jeton vérifié avant le calcul coûteux du hachage.
  const invitation = await previewInvitation(db, parsed.data.token);
  if (!invitation) return { error: INVITATION_EXPIRED, values };
  const problems = passwordProblems(parsed.data.password, {
    email: invitation.email,
    displayName: parsed.data.displayName,
  });
  if (problems.length) return { fieldErrors: { password: problems }, values };

  const result = await acceptInvitation(db, {
    token: parsed.data.token,
    displayName: parsed.data.displayName,
    passwordHash: await hashPassword(parsed.data.password),
  });
  switch (result) {
    case "expired":
      return { error: INVITATION_EXPIRED, values };
    case "email_registered":
      return {
        error:
          "Cette adresse a déjà un compte Stivea Vet. Demandez au cabinet de vous inviter avec une autre adresse.",
        values,
      };
    case "vet_limit":
      return {
        error:
          "Le cabinet a atteint le nombre de vétérinaires de sa formule. Contactez la personne qui vous a invité.",
        values,
      };
    case "accepted":
      return redirect("/connexion?raison=invitation");
  }
}
