import type { z } from "zod";

import type { PasswordProblem } from "@/domains/auth/password";
import type { AppDictionary } from "@/i18n/app/types";

import type { FormState } from "./form-state";

/*
 * Messages des formulaires de mot de passe (accès et « Sécurité du compte ») : codes du domaine
 * traduits dans la langue de la personne, jamais la valeur saisie.
 */

type AuthText = AppDictionary["auth"];

/** Code de validation du domaine (voir `validators.ts`) vers son message ; inconnu : message générique. */
function validationText(t: AuthText, code: string): string {
  return Object.hasOwn(t.validation, code)
    ? t.validation[code as keyof AuthText["validation"]]
    : t.invalidField;
}

export function fieldErrors(
  t: AuthText,
  error: z.ZodError,
): FormState["fieldErrors"] {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    (result[key] ??= []).push(validationText(t, issue.message));
  }
  return result;
}

function passwordProblemText(t: AuthText, problem: PasswordProblem): string {
  switch (problem.code) {
    case "too_short":
      return t.passwordProblems.too_short(problem.min);
    case "too_long":
      return t.passwordProblems.too_long(problem.max);
    case "repetitive":
    case "common":
    case "personal":
    case "unchanged":
      return t.passwordProblems[problem.code];
  }
}

export function passwordErrors(
  t: AuthText,
  problems: readonly PasswordProblem[],
): FormState["fieldErrors"] {
  return {
    password: problems.map((problem) => passwordProblemText(t, problem)),
  };
}
