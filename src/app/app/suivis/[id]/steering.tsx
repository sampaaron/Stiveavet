"use client";

import { useActionState, useState } from "react";

import { Button } from "@/ui/button";

import { ActionMessage } from "../../action-message";
import { initialActionState } from "../../action-state";
import { changeStatusAction } from "../launch-actions";

type Status = "draft" | "active" | "paused" | "human_takeover" | "ended";

/** Pause, reprise, arrêt et réactivation d'un suivi : décisions de vétérinaire. */
export function SteeringButtons({
  followupId,
  status,
}: {
  followupId: string;
  status: Status;
}) {
  const [state, action, pending] = useActionState(
    changeStatusAction,
    initialActionState,
  );
  const [confirmStop, setConfirmStop] = useState(false);

  const submit = (change: string, label: string, primary = false) => (
    <Button
      type="submit"
      name="change"
      value={change}
      size="sm"
      variant={primary ? "primary" : "secondary"}
      disabled={pending}
      aria-busy={pending}
    >
      {label}
    </Button>
  );

  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="followupId" value={followupId} />
      <div className="flex flex-wrap gap-2">
        {status === "active" || status === "human_takeover"
          ? submit("pause", "Mettre en pause")
          : null}
        {status === "paused"
          ? submit("resume", "Reprendre le suivi", true)
          : null}
        {status === "ended" ? submit("reactivate", "Réactiver le suivi") : null}
        {status !== "ended" && !confirmStop ? (
          <Button
            variant="quiet"
            size="sm"
            onClick={() => setConfirmStop(true)}
            disabled={pending}
          >
            Arrêter le suivi
          </Button>
        ) : null}
      </div>
      {confirmStop && status !== "ended" ? (
        <div className="grid gap-2 rounded-[var(--radius-control)] border border-urgent/25 bg-urgent-soft p-3 text-sm">
          <p>
            Numa n&apos;enverra plus rien pour ce suivi : messages et rappels
            prévus sont annulés. La discussion reste consultable.
          </p>
          <div className="flex flex-wrap gap-2">
            {submit("stop", "Confirmer l'arrêt", true)}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setConfirmStop(false)}
            >
              Annuler
            </Button>
          </div>
        </div>
      ) : null}
      <ActionMessage state={state} />
    </form>
  );
}
