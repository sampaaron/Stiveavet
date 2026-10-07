"use client";

import { useActionState } from "react";

import { Button } from "@/ui/button";

import { ActionMessage } from "./action-message";
import { initialActionState } from "./action-state";
import { alertAction } from "./alertes/actions";

/** « Accuser réception » et « Clore l'alerte » : décisions de vétérinaire. */
export function AlertButtons({
  alertId,
  from,
  canAcknowledge,
}: {
  alertId: string;
  from: "alertes" | "dossier";
  /** Urgence ou alerte encore sans accusé de réception. */
  canAcknowledge: boolean;
}) {
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
            Accuser réception
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
          Clore l&apos;alerte
        </Button>
      </div>
      <ActionMessage state={state} />
    </form>
  );
}
