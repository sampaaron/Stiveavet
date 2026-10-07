"use client";

import { useActionState } from "react";

import { Button } from "@/ui/button";

import { ActionMessage } from "../action-message";
import { initialActionState } from "../action-state";

import {
  cancelAction,
  changePlanAction,
  chooseCycleAction,
  settleAction,
} from "./actions";

type PlanOption = {
  value: string;
  label: string;
  detail: string;
  disabled: boolean;
};

function ConfirmBox({ children }: { children: React.ReactNode }) {
  return (
    <label className="flex items-start gap-2.5 text-sm">
      <input
        type="checkbox"
        name="confirmed"
        className="mt-0.5 size-4 shrink-0 accent-[var(--color-brand)]"
      />
      <span>{children}</span>
    </label>
  );
}

export function SettleForm() {
  const [state, action, pending] = useActionState(
    settleAction,
    initialActionState,
  );
  return (
    <form action={action} className="grid gap-2">
      <div>
        <Button type="submit" disabled={pending} aria-busy={pending}>
          Relancer le prélèvement (simulé)
        </Button>
      </div>
      <ActionMessage state={state} />
    </form>
  );
}

export function PlanForm({
  current,
  options,
}: {
  current: string;
  options: PlanOption[];
}) {
  const [state, action, pending] = useActionState(
    changePlanAction,
    initialActionState,
  );
  return (
    <form action={action} className="grid gap-4">
      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="sr-only">Formule</legend>
        {options.map((option) => (
          <label
            key={option.value}
            className="flex items-start gap-2.5 rounded-[var(--radius-control)] border border-line p-3 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-soft has-[:disabled]:opacity-60"
          >
            <input
              type="radio"
              name="plan"
              value={option.value}
              defaultChecked={option.value === current}
              disabled={option.disabled}
              className="mt-0.5 size-4 shrink-0 accent-[var(--color-brand)]"
            />
            <span>
              <span className="block font-semibold">{option.label}</span>
              <span className="block text-ink-muted">{option.detail}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <ActionMessage state={state} />
      <div>
        <Button
          type="submit"
          variant="secondary"
          disabled={pending}
          aria-busy={pending}
        >
          Changer de formule
        </Button>
      </div>
    </form>
  );
}

export function CommitAnnualForm({ priceLabel }: { priceLabel: string }) {
  const [state, action, pending] = useActionState(
    chooseCycleAction,
    initialActionState,
  );
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="cycle" value="annual" />
      <ConfirmBox>
        Je m&apos;engage pour 12 mois à {priceLabel} HT par mois, prélevés
        chaque mois.
      </ConfirmBox>
      <ActionMessage state={state} />
      <div>
        <Button type="submit" disabled={pending} aria-busy={pending}>
          Passer à l&apos;engagement annuel
        </Button>
      </div>
    </form>
  );
}

export function StayMonthlyForm() {
  const [state, action, pending] = useActionState(
    chooseCycleAction,
    initialActionState,
  );
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="cycle" value="monthly" />
      <div>
        <Button
          type="submit"
          variant="secondary"
          disabled={pending}
          aria-busy={pending}
        >
          Rester au mois
        </Button>
      </div>
      <ActionMessage state={state} />
    </form>
  );
}

export function CancelForm({ effectiveLabel }: { effectiveLabel: string }) {
  const [state, action, pending] = useActionState(
    cancelAction,
    initialActionState,
  );
  return (
    <form action={action} className="grid gap-3">
      <ConfirmBox>
        Je confirme la résiliation, effective le {effectiveLabel}.
      </ConfirmBox>
      <ActionMessage state={state} />
      <div>
        <Button
          type="submit"
          variant="secondary"
          disabled={pending}
          aria-busy={pending}
        >
          Résilier l&apos;abonnement
        </Button>
      </div>
    </form>
  );
}
