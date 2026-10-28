import { hash, verify } from "@node-rs/argon2";

import { isCommonPassword } from "./common-passwords";
import { AUTH_POLICY } from "./policy";

// Argon2id, paramètres minimaux recommandés par l'OWASP (19 Mio, 2 passes).
const ARGON2_OPTIONS = {
  algorithm: 2, // Argon2id
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

// Empreinte de référence pour garder un temps de réponse identique quand le compte n'existe pas.
let decoyHash: Promise<string> | undefined;

/** Vérifie un mot de passe ; sans empreinte connue, fait le même travail puis refuse. */
export async function verifyPassword(
  passwordHash: string | null,
  password: string,
): Promise<boolean> {
  if (!passwordHash) {
    decoyHash ??= hashPassword("stivea-decoy-password");
    await verify(await decoyHash, password).catch(() => false);
    return false;
  }
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/**
 * Raison de refus d'un mot de passe : un code stable, avec la valeur utile à son message.
 * L'écran la traduit dans la langue de la personne (ADR 0022).
 */
export type PasswordProblem =
  | { code: "too_short"; min: number }
  | { code: "too_long"; max: number }
  | { code: "repetitive" }
  | { code: "common" }
  | { code: "personal" }
  | { code: "unchanged" };

/** Raisons de refus, dans l'ordre où l'écran les affiche sous le champ. */
export function passwordProblems(
  password: string,
  context: { email?: string; displayName?: string } = {},
): PasswordProblem[] {
  const problems: PasswordProblem[] = [];
  const { minLength, maxLength } = AUTH_POLICY.password;
  if (password.length < minLength)
    problems.push({ code: "too_short", min: minLength });
  if (password.length > maxLength)
    problems.push({ code: "too_long", max: maxLength });
  if (new Set(password).size < 5) problems.push({ code: "repetitive" });

  if (isCommonPassword(password)) problems.push({ code: "common" });

  const lowered = password.toLowerCase();

  const personal = [
    context.email?.split("@")[0],
    ...(context.displayName?.split(/\s+/) ?? []),
  ].filter((part): part is string => !!part && part.length >= 4);
  if (personal.some((part) => lowered.includes(part.toLowerCase())))
    problems.push({ code: "personal" });
  return problems;
}
