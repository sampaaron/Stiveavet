"use client";

import {
  CalendarCheck,
  CalendarX,
  ImageUp,
  PhoneCall,
  Trash2,
} from "lucide-react";
import { useActionState, useId } from "react";

import { useAppText } from "@/i18n/app/client";

import { Button } from "@/ui/button";

import { ActionMessage, selectClasses } from "../action-message";
import { initialActionState } from "../action-state";
import {
  closeCallbackAction,
  decideAppointmentAction,
  importCaptureAction,
  removeSlotAction,
} from "./actions";

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
  const t = useAppText();
  const id = useId();
  return (
    <form action={action} className="grid gap-3">
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-vet`} className="text-sm font-semibold">
          {t.agenda.capture.vetLabel}
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
          {t.agenda.capture.fileLabel}
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
          {t.agenda.capture.fileHint}
        </p>
      </div>
      <div>
        <Button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          icon={<ImageUp aria-hidden="true" className="size-4" />}
        >
          {t.agenda.capture.submit}
        </Button>
      </div>
      <ActionMessage state={state} />
    </form>
  );
}

/** `label` : nom accessible déjà traduit par la page (jour, heures, vétérinaire). */
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
        aria-label={label}
        icon={<Trash2 aria-hidden="true" className="size-4" />}
      />
      <ActionMessage state={state} />
    </form>
  );
}

/** Confirmer ou refuser un rendez-vous choisi par le propriétaire ; Numa le prévient. */
export function AppointmentDecision({
  appointmentId,
  animalName,
  when,
}: {
  appointmentId: string;
  animalName: string;
  when: string;
}) {
  const [state, action, pending] = useActionState(
    decideAppointmentAction,
    initialActionState,
  );
  const t = useAppText();
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          name="decision"
          value="confirm"
          size="sm"
          disabled={pending}
          aria-busy={pending}
          aria-label={t.agenda.pending.confirmLabel(animalName, when)}
          icon={<CalendarCheck aria-hidden="true" className="size-4" />}
        >
          {t.agenda.pending.confirm}
        </Button>
        <Button
          type="submit"
          name="decision"
          value="decline"
          size="sm"
          variant="secondary"
          disabled={pending}
          aria-label={t.agenda.pending.declineLabel(animalName, when)}
          icon={<CalendarX aria-hidden="true" className="size-4" />}
        >
          {t.agenda.pending.decline}
        </Button>
      </div>
      <ActionMessage state={state} />
    </form>
  );
}

export function CallbackDoneButton({
  requestId,
  animalName,
  requestedAt,
}: {
  requestId: string;
  animalName: string;
  requestedAt: string;
}) {
  const [state, action, pending] = useActionState(
    closeCallbackAction,
    initialActionState,
  );
  const t = useAppText();
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="requestId" value={requestId} />
      <div>
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          disabled={pending}
          aria-label={t.agenda.callbacks.doneLabel(animalName, requestedAt)}
          icon={<PhoneCall aria-hidden="true" className="size-4" />}
        >
          {t.agenda.callbacks.done}
        </Button>
      </div>
      <ActionMessage state={state} />
    </form>
  );
}
