"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { DomainError } from "@/domains/equipe/actor";
import { PLANS } from "@/domains/facturation/rules";
import { memberContext } from "@/server/authz";
import { services } from "@/server/services";
import { formatDate } from "@/ui/format";

import type { ActionState } from "../action-state";
import { attempt, domainFailure } from "../domain-messages";

const INVALID: ActionState = { error: "Demande invalide. Rechargez la page." };
const CONFIRM_REQUIRED: ActionState = {
  error: "Cochez la case de confirmation pour continuer.",
};

const planInput = z.object({ plan: z.enum(PLANS) });
const cycleInput = z.object({
  cycle: z.enum(["annual", "monthly"]),
  confirmed: z.boolean(),
});

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * Chaque action repasse par la garde serveur ; le service refuse sans `billing.manage`,
 * revérifie l'état de l'abonnement et journalise le changement.
 */
async function finish(result: ActionState): Promise<ActionState> {
  revalidatePath("/app", "layout");
  return result;
}

export async function changePlanAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = planInput.safeParse({ plan: text(form, "plan") });
  if (!parsed.success) return INVALID;
  const context = await memberContext();
  return finish(
    await attempt(
      () => services.billing().changePlan(context, parsed.data.plan),
      "Formule modifiée. Elle s'applique à la prochaine échéance.",
    ),
  );
}

export async function chooseCycleAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = cycleInput.safeParse({
    cycle: text(form, "cycle"),
    confirmed: form.get("confirmed") === "on",
  });
  if (!parsed.success) return INVALID;
  if (parsed.data.cycle === "annual" && !parsed.data.confirmed)
    return CONFIRM_REQUIRED;
  const context = await memberContext();
  return finish(
    await attempt(
      () => services.billing().chooseCycle(context, parsed.data.cycle),
      parsed.data.cycle === "annual"
        ? "Engagement annuel enregistré. Le tarif annuel s'applique à la prochaine échéance."
        : "C'est noté : vous restez au mois, sans engagement.",
    ),
  );
}

export async function cancelAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  if (form.get("confirmed") !== "on") return CONFIRM_REQUIRED;
  const context = await memberContext();
  try {
    const endsAt = await services.billing().cancel(context);
    return finish({
      notice: `Résiliation enregistrée. Elle prend effet le ${formatDate(endsAt)} ; vos suivis en cours continuent jusqu'à leur fin.`,
    });
  } catch (error) {
    if (error instanceof DomainError) return finish(domainFailure(error));
    throw error;
  }
}

export async function settleAction(): Promise<ActionState> {
  const context = await memberContext();
  try {
    const settled = await services.billing().settle(context);
    return finish(
      settled
        ? { notice: "Prélèvement réussi (simulé). Merci, tout est en ordre." }
        : {
            error:
              "Le prélèvement a de nouveau échoué. Vérifiez le mandat ou contactez le support.",
          },
    );
  } catch (error) {
    if (error instanceof DomainError) return finish(domainFailure(error));
    throw error;
  }
}
