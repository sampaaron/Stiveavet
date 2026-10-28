"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { memberContext } from "@/server/authz";
import { services } from "@/server/services";

import type { ActionState } from "../action-state";
import { attempt, invalidRequest } from "../domain-messages";
import { fields } from "../form-data";

const idInput = z.object({ id: z.uuid() });
// Retour vers la page des tâches ou la boîte « À traiter », jamais vers une adresse libre.
const origin = z.enum(["taches", "accueil"]).catch("taches");

function jobId(form: FormData): string | null {
  const parsed = idInput.safeParse(fields(form, ["id"]));
  return parsed.success ? parsed.data.id : null;
}

function back(form: FormData, done: "relance" | "abandon"): never {
  revalidatePath("/app/taches");
  if (origin.parse(form.get("from")) === "accueil") {
    revalidatePath("/app");
    redirect(`/app?fait=tache-${done}#a-traiter`);
  }
  redirect(`/app/taches?fait=${done}`);
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
  back(form, "relance");
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
  back(form, "abandon");
}
