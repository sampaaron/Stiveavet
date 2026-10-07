import { hash, verify } from "@node-rs/argon2";

import { COMMON_PASSWORD_ROOTS } from "./common-passwords";
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

function normalizedRoot(password: string): string {
  return password
    .toLowerCase()
    .normalize("NFC")
    .replace(/[\d\W_]+$/u, "")
    .replace(/^[\d\W_]+/u, "");
}

/** Raisons de refus, affichées telles quelles sous le champ. */
export function passwordProblems(
  password: string,
  context: { email?: string; displayName?: string } = {},
): string[] {
  const problems: string[] = [];
  const { minLength, maxLength } = AUTH_POLICY.password;
  if (password.length < minLength)
    problems.push(`Au moins ${minLength} caractères.`);
  if (password.length > maxLength)
    problems.push(`Au plus ${maxLength} caractères.`);
  if (new Set(password).size < 5) problems.push("Trop de caractères répétés.");

  const lowered = password.toLowerCase();
  const root = normalizedRoot(password);
  if (COMMON_PASSWORD_ROOTS.has(lowered) || COMMON_PASSWORD_ROOTS.has(root))
    problems.push("Ce mot de passe figure parmi les plus utilisés.");

  const personal = [
    context.email?.split("@")[0],
    ...(context.displayName?.split(/\s+/) ?? []),
  ].filter((part): part is string => !!part && part.length >= 4);
  if (personal.some((part) => lowered.includes(part.toLowerCase())))
    problems.push("Il ne doit pas contenir votre nom ou votre e-mail.");
  return problems;
}
