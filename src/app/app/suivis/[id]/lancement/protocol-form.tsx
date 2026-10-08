"use client";

import { useActionState, useId } from "react";

import { useAppText } from "@/i18n/app/client";
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
  const text = useAppText().followups.protocolForm;
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
          {text.label}
        </label>
        <select
          id={`${id}-protocole`}
          name="protocolId"
          className={`${selectClasses} w-full min-w-0`}
          defaultValue={currentProtocolId ?? ""}
        >
          {currentProtocolId ? null : (
            <option value="">{text.placeholder}</option>
          )}
          {options.map((option) => (
            <option key={option.protocolId} value={option.protocolId}>
              {text.option(option.name, option.versionNumber)}
            </option>
          ))}
        </select>
      </div>
      <p className="text-sm text-ink-muted">{text.help}</p>
      <ActionMessage state={state} />
      <div>
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          disabled={pending || options.length === 0}
          aria-busy={pending}
        >
          {currentProtocolId ? text.change : text.apply}
        </Button>
      </div>
    </form>
  );
}
