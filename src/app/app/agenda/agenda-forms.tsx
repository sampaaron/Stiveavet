"use client";

import { ImageUp, Trash2 } from "lucide-react";
import { useActionState, useId } from "react";

import { Button } from "@/ui/button";

import { ActionMessage, selectClasses } from "../action-message";
import { initialActionState } from "../action-state";
import { importCaptureAction, removeSlotAction } from "./actions";

/** Envoi d'une capture d'agenda : un vétérinaire, une image, rien d'autre. */
export function CaptureForm({
  vets,
  defaultVet,
}: {
  vets: { membershipId: string; name: string }[];
  defaultVet: string | undefined;
}) {
  const [state, action, pending] = useActionState(
    importCaptureAction,
    initialActionState,
  );
  const id = useId();
  return (
    <form action={action} className="grid gap-3">
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-vet`} className="text-sm font-semibold">
          Agenda de
        </label>
        <select
          id={`${id}-vet`}
          name="vetMembershipId"
          required
          defaultValue={defaultVet}
          className={`${selectClasses} w-full`}
        >
          {vets.map((vet) => (
            <option key={vet.membershipId} value={vet.membershipId}>
              {vet.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-file`} className="text-sm font-semibold">
          Capture d&apos;écran de l&apos;agenda
        </label>
        <input
          id={`${id}-file`}
          name="capture"
          type="file"
          required
          accept="image/jpeg,image/png,image/webp"
          aria-describedby={`${id}-hint`}
          className="min-h-11 w-full min-w-0 rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2 text-[15px] file:mr-3 file:rounded-full file:border-0 file:bg-brand-soft file:px-3 file:py-1 file:text-sm file:font-semibold file:text-brand-ink"
        />
        <p id={`${id}-hint`} className="text-xs text-ink-muted">
          JPEG, PNG ou WebP, 5 Mo au plus.
        </p>
      </div>
      <div>
        <Button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          icon={<ImageUp aria-hidden="true" className="size-4" />}
        >
          Lire les créneaux libres
        </Button>
      </div>
      <ActionMessage state={state} />
    </form>
  );
}

export function RemoveSlotButton({
  slotId,
  label,
}: {
  slotId: string;
  label: string;
}) {
  const [state, action, pending] = useActionState(
    removeSlotAction,
    initialActionState,
  );
  return (
    <form action={action}>
      <input type="hidden" name="slotId" value={slotId} />
      <Button
        type="submit"
        size="sm"
        variant="quiet"
        disabled={pending}
        aria-label={`Retirer le créneau ${label}`}
        icon={<Trash2 aria-hidden="true" className="size-4" />}
      />
      <ActionMessage state={state} />
    </form>
  );
}
