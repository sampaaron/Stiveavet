"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { memberContext } from "@/server/authz";
import { services } from "@/server/services";

import type { ActionState } from "../action-state";
import { attempt, invalidRequest } from "../domain-messages";

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
  if (!id) return invalidRequest();
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
  if (!id) return invalidRequest();
  const context = await memberContext();
  const result = await attempt(() => services.jobs().cancel(context, id), "");
  if (result.error) return result;
  revalidatePath("/app/taches");
  redirect("/app/taches?fait=abandon");
}
