"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { appText } from "@/i18n/app/server";
import { memberContext } from "@/server/authz";
import { services } from "@/server/services";

import type { ActionState } from "../action-state";
import { attempt } from "../domain-messages";

/** Refus d'une entrée mal formée (identifiant manipulé, page périmée). */
async function invalid(): Promise<ActionState> {
  const { t } = await appText();
  return { error: t.common.invalidRequest };
}

const idInput = z.object({ id: z.uuid() });

function jobId(form: FormData): string | null {
  const value = form.get("id");
  const parsed = idInput.safeParse({
    id: typeof value === "string" ? value : "",
  });
  return parsed.success ? parsed.data.id : null;
}

export async function retryJobAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const id = jobId(form);
  if (!id) return invalid();
  const context = await memberContext();
  const result = await attempt(() => services.jobs().retry(context, id), "");
  if (result.error) return result;
  // La tâche quitte la liste : la confirmation s'affiche en haut de la page.
  revalidatePath("/app/taches");
  redirect("/app/taches?fait=relance");
}

export async function cancelJobAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const id = jobId(form);
  if (!id) return invalid();
  const context = await memberContext();
  const result = await attempt(() => services.jobs().cancel(context, id), "");
  if (result.error) return result;
  revalidatePath("/app/taches");
  redirect("/app/taches?fait=abandon");
}
