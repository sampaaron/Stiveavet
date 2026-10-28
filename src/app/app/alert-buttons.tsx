"use client";

import { useActionState, useId } from "react";

import { useAppText } from "@/i18n/app/client";
import { Button } from "@/ui/button";

import { ActionMessage, selectClasses } from "./action-message";
import { initialActionState } from "./action-state";
import { alertAction } from "./alertes/actions";

/** Écran d'où vient la décision, où l'on revient ensuite. */
export type AlertOrigin = "alertes" | "dossier" | "accueil";

/**
 * « Accuser réception » et « Clore l'alerte » : décisions de vétérinaire. L'assistante
 * autorisée (alerte « à surveiller ») lit « Je m'en occupe » et peut transmettre au vétérinaire.
 */
export function AlertButtons({
  alertId,
  from,
  canAcknowledge,
  canForward = false,
}: {
  alertId: string;
  from: AlertOrigin;
  /** Urgence ou alerte encore sans accusé de réception. */
  canAcknowledge: boolean;
  /** Assistante autorisée, alerte pas encore transmise. */
  canForward?: boolean;
}) {
  const t = useAppText();
  const [state, action, pending] = useActionState(
    alertAction,
    initialActionState,
  );
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="alertId" value={alertId} />
      <input type="hidden" name="from" value={from} />
      <div className="flex flex-wrap gap-2">
        {canAcknowledge ? (
          <Button
            type="submit"
            name="intent"
            value="acknowledge"
            size="sm"
            disabled={pending}
            aria-busy={pending}
          >
            {canForward
              ? t.alerts.buttons.takeCharge
              : t.alerts.buttons.acknowledge}
          </Button>
        ) : null}
        <Button
          type="submit"
          name="intent"
          value="resolve"
          size="sm"
          variant={canAcknowledge ? "secondary" : "primary"}
          disabled={pending}
          aria-busy={pending}
        >
          {t.alerts.buttons.resolve}
        </Button>
        {canForward ? (
          <Button
            type="submit"
            name="intent"
            value="forward"
            size="sm"
            variant="secondary"
            disabled={pending}
            aria-busy={pending}
          >
            {t.alerts.buttons.forward}
          </Button>
        ) : null}
      </div>
      <ActionMessage state={state} />
    </form>
  );
}

/** « Confier à » : un autre vétérinaire qui lit le dossier en clinique reçoit l'alerte. */
export function ReassignForm({
  alertId,
  from,
  options,
  current,
}: {
  alertId: string;
  from: AlertOrigin;
  options: { value: string; label: string }[];
  current: string;
}) {
  const t = useAppText();
  const id = useId();
  const [state, action, pending] = useActionState(
    alertAction,
    initialActionState,
  );
  return (
    <form action={action} className="mt-3 grid gap-2">
      <input type="hidden" name="alertId" value={alertId} />
      <input type="hidden" name="from" value={from} />
      <input type="hidden" name="intent" value="reassign" />
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid min-w-0 gap-1">
          <label htmlFor={`${id}-vet`} className="text-sm font-semibold">
            {t.alerts.reassign.label}
          </label>
          <select
            id={`${id}-vet`}
            name="membershipId"
            defaultValue={current}
            className={`${selectClasses} max-w-full`}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          disabled={pending}
          aria-busy={pending}
        >
          {t.alerts.reassign.submit}
        </Button>
      </div>
      <ActionMessage state={state} />
    </form>
  );
}
