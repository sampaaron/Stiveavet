"use server";

import { z } from "zod";

import { saveConsent } from "@/server/consent";

const choiceInput = z.object({
  choice: z.enum(["all", "none", "custom"]),
  audience: z.literal("on").optional(),
  marketing: z.literal("on").optional(),
});

/**
 * Enregistre le choix des cookies (ADR 0053). La page se redessine d'elle-même avec le
 * nouveau cookie : le bandeau disparaît, même sans JavaScript.
 */
export async function chooseConsentAction(form: FormData): Promise<void> {
  const parsed = choiceInput.safeParse({
    choice: form.get("choice"),
    audience: form.get("audience") ?? undefined,
    marketing: form.get("marketing") ?? undefined,
  });
  if (!parsed.success) return;
  const { choice, audience, marketing } = parsed.data;
  await saveConsent({
    audience: choice === "all" || (choice === "custom" && audience === "on"),
    marketing: choice === "all" || (choice === "custom" && marketing === "on"),
    givenAt: new Date(),
  });
}
