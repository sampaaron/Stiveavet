"use server";

import { redirect } from "next/navigation";

import { demoRequestInput } from "@/domains/demo/validators";
import { pathFor } from "@/i18n/routes";
import { setDemoCookie } from "@/server/auth/cookies";
import { requestOrigin } from "@/server/auth/origin";
import { services } from "@/server/services";

import type { DemoFormState, UnsubscribeState } from "./form-states";

function text(form: FormData, name: string, max: number): string {
  const value = form.get(name);
  return typeof value === "string" ? value.slice(0, max) : "";
}

/** Demande de démo : enregistre le prospect, ouvre la démo dans ce navigateur. */
export async function demoRequestAction(
  _previous: DemoFormState,
  form: FormData,
): Promise<DemoFormState> {
  const values = {
    email: text(form, "email", 254),
    cabinetName: text(form, "cabinetName", 160),
    vetCount: text(form, "vetCount", 1),
  };
  const parsed = demoRequestInput.safeParse({
    ...values,
    locale: text(form, "locale", 2),
  });
  if (!parsed.success) {
    const fieldErrors: DemoFormState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (field === "email" || field === "cabinetName" || field === "vetCount")
        fieldErrors[field] ??= issue.message;
    }
    return { fieldErrors, values };
  }

  const result = await services
    .demo()
    .capture(parsed.data, (await requestOrigin()).ip);
  if (result.status === "rate_limited")
    return { error: "rate_limited", values };
  await setDemoCookie(result.accessToken);
  redirect(pathFor("demoSpace", parsed.data.locale));
}

/** Désinscription confirmée par un bouton (un lien seul ne désinscrit jamais). */
export async function unsubscribeAction(
  _previous: UnsubscribeState,
  form: FormData,
): Promise<UnsubscribeState> {
  const done = await services
    .demo()
    .unsubscribe(text(form, "jeton", 64) || undefined);
  return done ? "done" : "invalid";
}
