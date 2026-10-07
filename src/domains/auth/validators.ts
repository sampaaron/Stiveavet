import { z } from "zod";

import { PLANS } from "@/domains/facturation/rules";

import { AUTH_POLICY } from "./policy";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "Adresse trop longue.")
  .pipe(z.email("Adresse e-mail invalide."));

// Pas de règle de complexité à la connexion : seulement une borne contre les entrées géantes.
const anyPassword = z
  .string()
  .min(1, "Saisissez votre mot de passe.")
  .max(AUTH_POLICY.password.maxLength * 4, "Mot de passe trop long.");

export const loginInput = z.object({ email, password: anyPassword });

export const codeInput = z.object({
  code: z
    .string()
    .transform((value) => value.replace(/\s/g, ""))
    .pipe(z.string().regex(/^\d{6}$/, "Le code compte 6 chiffres.")),
});

export const unlockInput = z.object({ password: anyPassword });

export const resetRequestInput = z.object({ email });

export const newPasswordInput = z
  .object({
    token: z.string().max(64),
    password: z.string().max(AUTH_POLICY.password.maxLength * 4),
    confirmation: z.string().max(AUTH_POLICY.password.maxLength * 4),
  })
  .refine((value) => value.password === value.confirmation, {
    message: "Les deux mots de passe ne correspondent pas.",
    path: ["confirmation"],
  });

export const signupInput = z
  .object({
    organizationName: z
      .string()
      .trim()
      .min(2, "Nom du cabinet trop court.")
      .max(160, "Nom du cabinet trop long."),
    displayName: z
      .string()
      .trim()
      .min(2, "Indiquez votre nom.")
      .max(120, "Nom trop long."),
    email,
    plan: z.enum(PLANS, "Choisissez la formule qui suivra l'essai."),
    password: z.string().max(AUTH_POLICY.password.maxLength * 4),
    confirmation: z.string().max(AUTH_POLICY.password.maxLength * 4),
    // Cases à cocher exigées par le cahier des charges (§14) : jamais cochées par défaut.
    acceptTerms: z
      .literal("on", "Acceptez les conditions d'utilisation pour continuer.")
      .transform(() => true as const),
    authorized: z
      .literal(
        "on",
        "Confirmez que vous êtes autorisé à souscrire au nom du cabinet.",
      )
      .transform(() => true as const),
  })
  .refine((value) => value.password === value.confirmation, {
    message: "Les deux mots de passe ne correspondent pas.",
    path: ["confirmation"],
  });

export const invitationInput = z
  .object({
    token: z.string().max(64),
    displayName: z
      .string()
      .trim()
      .min(2, "Indiquez votre nom.")
      .max(120, "Nom trop long."),
    password: z.string().max(AUTH_POLICY.password.maxLength * 4),
    confirmation: z.string().max(AUTH_POLICY.password.maxLength * 4),
  })
  .refine((value) => value.password === value.confirmation, {
    message: "Les deux mots de passe ne correspondent pas.",
    path: ["confirmation"],
  });
