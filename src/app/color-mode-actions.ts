"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { currentSession } from "@/server/auth";
import { saveColorMode, setColorModeCookie } from "@/server/color-mode";
import { COLOR_MODES } from "@/ui/color-mode";

/** Le choix se fait depuis ces deux pages seulement ; on y revient ensuite. */
const choiceInput = z.object({
  mode: z.enum(COLOR_MODES),
  back: z.enum(["/app/reglages", "/app/compte"]),
});

/** Mode d'affichage : gardé dans le compte de la personne connectée (ADR 0052). */
export async function chooseColorModeAction(form: FormData): Promise<void> {
  const parsed = choiceInput.safeParse({
    mode: form.get("mode"),
    back: form.get("back"),
  });
  if (!parsed.success) redirect("/app");
  const session = await currentSession();
  if (!session || session.locked) redirect("/connexion");
  await saveColorMode(session, parsed.data.mode);
  await setColorModeCookie(parsed.data.mode);
  redirect(`${parsed.data.back}#affichage`);
}
