"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { DomainError } from "@/domains/equipe/actor";
import { PLANS } from "@/domains/facturation/rules";
import { appText } from "@/i18n/app/server";
import { memberContext } from "@/server/authz";
import { services } from "@/server/services";
import { formatDate } from "@/ui/format";

import type { ActionState } from "../action-state";
import { attempt, domainFailure } from "../domain-messages";

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
  const { t } = await appText();
  const parsed = planInput.safeParse({ plan: text(form, "plan") });
  if (!parsed.success) return { error: t.common.invalidRequest };
  const context = await memberContext();
  return finish(
    await attempt(
      () => services.billing().changePlan(context, parsed.data.plan),
      t.billing.notices.planChanged,
    ),
  );
}

export async function chooseCycleAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await appText();
  const parsed = cycleInput.safeParse({
    cycle: text(form, "cycle"),
    confirmed: form.get("confirmed") === "on",
  });
  if (!parsed.success) return { error: t.common.invalidRequest };
  if (parsed.data.cycle === "annual" && !parsed.data.confirmed)
    return { error: t.billing.notices.confirmRequired };
  const context = await memberContext();
  return finish(
    await attempt(
      () => services.billing().chooseCycle(context, parsed.data.cycle),
      parsed.data.cycle === "annual"
        ? t.billing.notices.annualCommitted
        : t.billing.notices.stayMonthly,
    ),
  );
}

export async function cancelAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t, locale } = await appText();
  if (form.get("confirmed") !== "on")
    return { error: t.billing.notices.confirmRequired };
  const context = await memberContext();
  try {
    const endsAt = await services.billing().cancel(context);
    return finish({
      notice: t.billing.notices.cancelled(formatDate(endsAt, locale)),
    });
  } catch (error) {
    if (error instanceof DomainError) return finish(await domainFailure(error));
    throw error;
  }
}

export async function settleAction(): Promise<ActionState> {
  const context = await memberContext();
  const { t } = await appText();
  try {
    const settled = await services.billing().settle(context);
    return finish(
      settled
        ? { notice: t.billing.notices.settled }
        : { error: t.billing.notices.settleFailed },
    );
  } catch (error) {
    if (error instanceof DomainError) return finish(await domainFailure(error));
    throw error;
  }
}
