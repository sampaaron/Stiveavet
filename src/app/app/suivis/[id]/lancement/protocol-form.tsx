"use client";

import { useActionState, useId } from "react";

import { Button } from "@/ui/button";

import { ActionMessage, selectClasses } from "../../../action-message";
import { initialActionState } from "../../../action-state";
import { applyProtocolAction } from "../../launch-actions";

/** Brouillon : choisir un autre protocole remplace étapes et signes d'alerte de la fiche. */
export function ProtocolForm({
  followupId,
  currentProtocolId,
  options,
}: {
  followupId: string;
  currentProtocolId: string | null;
  options: { protocolId: string; name: string; versionNumber: number }[];
}) {
  const [state, action, pending] = useActionState(
    applyProtocolAction,
    initialActionState,
  );
  const id = useId();
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="followupId" value={followupId} />
      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor={`${id}-protocole`} className="text-sm font-semibold">
          Protocole
        </label>
        <select
          id={`${id}-protocole`}
          name="protocolId"
          className={`${selectClasses} w-full min-w-0`}
          defaultValue={currentProtocolId ?? ""}
        >
          {currentProtocolId ? null : (
            <option value="">Choisir un protocole validé</option>
          )}
          {options.map((option) => (
            <option key={option.protocolId} value={option.protocolId}>
              {option.name} (version {option.versionNumber})
            </option>
          ))}
        </select>
      </div>
      <p className="text-sm text-ink-muted">
        Seuls les protocoles validés par un vétérinaire et adaptés à
        l&apos;espèce sont proposés. Changer de protocole remplace les étapes et
        les signes d&apos;alerte de la fiche.
      </p>
      <ActionMessage state={state} />
      <div>
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          disabled={pending || options.length === 0}
          aria-busy={pending}
        >
          {currentProtocolId
            ? "Changer de protocole"
            : "Appliquer ce protocole"}
        </Button>
      </div>
    </form>
  );
}
