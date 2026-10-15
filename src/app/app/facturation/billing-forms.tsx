"use client";

import { useActionState } from "react";

import { useAppText } from "@/i18n/app/client";
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

export function SettleForm({ simulated }: { simulated: boolean }) {
  const [state, action, pending] = useActionState(
    settleAction,
    initialActionState,
  );
  const t = useAppText();
  return (
    <form action={action} className="grid gap-2">
      <div>
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {simulated ? t.billing.settle : t.billing.settleLive}
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
  const t = useAppText();
  return (
    <form action={action} className="grid gap-4">
      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="sr-only">{t.billing.changePlan.legend}</legend>
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
          {t.billing.changePlan.submit}
        </Button>
      </div>
    </form>
  );
}

export function CommitAnnualForm({
  priceLabel,
  startsOnLabel,
}: {
  priceLabel: string;
  startsOnLabel: string;
}) {
  const [state, action, pending] = useActionState(
    chooseCycleAction,
    initialActionState,
  );
  const t = useAppText();
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="cycle" value="annual" />
      <ConfirmBox>
        {t.billing.annual.confirm(priceLabel, startsOnLabel)}
      </ConfirmBox>
      <ActionMessage state={state} />
      <div>
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {t.billing.annual.submit}
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
  const t = useAppText();
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
          {t.billing.annual.stayMonthly}
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
  const t = useAppText();
  return (
    <form action={action} className="grid gap-3">
      <ConfirmBox>{t.billing.cancel.confirm(effectiveLabel)}</ConfirmBox>
      <ActionMessage state={state} />
      <div>
        <Button
          type="submit"
          variant="secondary"
          disabled={pending}
          aria-busy={pending}
        >
          {t.billing.cancel.submit}
        </Button>
      </div>
    </form>
  );
}
