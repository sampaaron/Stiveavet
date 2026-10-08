import { z } from "zod";

import { PLANS } from "@/domains/facturation/rules";

import { AUTH_POLICY } from "./policy";

/*
 * Les messages sont des codes stables (snake_case), traduits par l'écran dans la langue de la
 * personne (ADR 0022) : voir `auth.validation` dans `src/i18n/app/fr/auth.ts`.
 */

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "email_too_long")
  .pipe(z.email("email_invalid"));

// Pas de règle de complexité à la connexion : seulement une borne contre les entrées géantes.
const anyPassword = z
  .string()
  .min(1, "password_required")
  .max(AUTH_POLICY.password.maxLength * 4, "password_too_long");

// Nouveau mot de passe : la politique complète est vérifiée par `passwordProblems`.
const newPassword = z
  .string()
  .max(AUTH_POLICY.password.maxLength * 4, "password_too_long");

export const loginInput = z.object({ email, password: anyPassword });

export const codeInput = z.object({
  code: z
    .string()
    .transform((value) => value.replace(/\s/g, ""))
    .pipe(z.string().regex(/^\d{6}$/, "code_format")),
});

export const unlockInput = z.object({ password: anyPassword });

export const resetRequestInput = z.object({ email });

export const newPasswordInput = z
  .object({
    token: z.string().max(64),
    password: newPassword,
    confirmation: newPassword,
  })
  .refine((value) => value.password === value.confirmation, {
    message: "passwords_mismatch",
    path: ["confirmation"],
  });

export const signupInput = z
  .object({
    organizationName: z
      .string()
      .trim()
      .min(2, "organization_name_short")
      .max(160, "organization_name_long"),
    displayName: z
      .string()
      .trim()
      .min(2, "display_name_required")
      .max(120, "display_name_long"),
    email,
    plan: z.enum(PLANS, "plan_required"),
    password: newPassword,
    confirmation: newPassword,
    // Cases à cocher exigées par le cahier des charges (§14) : jamais cochées par défaut.
    acceptTerms: z
      .literal("on", "terms_required")
      .transform(() => true as const),
    authorized: z
      .literal("on", "authority_required")
      .transform(() => true as const),
  })
  .refine((value) => value.password === value.confirmation, {
    message: "passwords_mismatch",
    path: ["confirmation"],
  });

export const invitationInput = z
  .object({
    token: z.string().max(64),
    displayName: z
      .string()
      .trim()
      .min(2, "display_name_required")
      .max(120, "display_name_long"),
    password: newPassword,
    confirmation: newPassword,
  })
  .refine((value) => value.password === value.confirmation, {
    message: "passwords_mismatch",
    path: ["confirmation"],
  });
