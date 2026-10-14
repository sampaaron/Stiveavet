"use client";

import { useActionState, useId, useState } from "react";

import { useAppText } from "@/i18n/app/client";
import { Button } from "@/ui/button";
import { TextField } from "@/ui/text-field";

import { ActionMessage, selectClasses } from "../action-message";
import { initialActionState } from "../action-state";

import { animalStatusAction, launchFromAnimalAction } from "./actions";
import type { PatientFormState } from "./actions";

/** Archiver ou restaurer ; supprimer (animal jamais suivi) après confirmation. */
export function AnimalStatusButtons({
  animalId,
  animalName,
  archived,
  canDelete,
}: {
  animalId: string;
  animalName: string;
  archived: boolean;
  canDelete: boolean;
}) {
  const [state, action, pending] = useActionState(
    animalStatusAction,
    initialActionState,
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const t = useAppText();
  const text = t.patients.record;
  return (
    <form action={action} className="grid justify-items-end gap-2">
      <input type="hidden" name="animalId" value={animalId} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="submit"
          name="change"
          value={archived ? "restore" : "archive"}
          variant="secondary"
          size="sm"
          disabled={pending}
        >
          {archived ? text.restore : text.archive}
        </Button>
        {canDelete && !confirmDelete ? (
          <Button
            variant="quiet"
            size="sm"
            onClick={() => setConfirmDelete(true)}
            aria-label={text.deleteLabel(animalName)}
          >
            {text.delete}
          </Button>
        ) : null}
      </div>
      {confirmDelete ? (
        <div className="grid max-w-sm gap-2 rounded-[var(--radius-control)] border border-urgent/25 bg-urgent-soft p-3 text-sm">
          <p>{text.deleteConfirm}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              name="change"
              value="delete"
              size="sm"
              className="bg-urgent hover:bg-urgent/90"
              disabled={pending}
            >
              {text.delete}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setConfirmDelete(false)}
            >
              {t.common.cancel}
            </Button>
          </div>
        </div>
      ) : null}
      <ActionMessage state={state} />
    </form>
  );
}

const initialLaunch: PatientFormState = {};

/** Intervention, date, contrôle et protocole : le brouillon s'ouvre ensuite en fiche. */
export function LaunchFromAnimalForm({
  animalId,
  defaultProcedureAt,
  protocols,
}: {
  animalId: string;
  /** Valeur `datetime-local` de maintenant, heure de Paris. */
  defaultProcedureAt: string;
  protocols: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(
    launchFromAnimalAction,
    initialLaunch,
  );
  const t = useAppText();
  const text = t.patients.launch;
  const id = useId();
  const fields = state.fields ?? {};
  const errors = (name: string) => (fields[name] ? [fields[name]] : undefined);
  return (
    <form action={action} className="grid gap-4" noValidate>
      <input type="hidden" name="animalId" value={animalId} />
      <TextField
        label={text.procedure}
        name="procedure"
        placeholder={text.procedurePlaceholder}
        defaultValue={state.entered?.procedure}
        autoComplete="off"
        required
        minLength={3}
        maxLength={160}
        errors={errors("procedure")}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label={text.procedureAt}
          name="procedureAt"
          type="datetime-local"
          defaultValue={state.entered?.procedureAt ?? defaultProcedureAt}
          required
          errors={errors("procedureAt")}
        />
        <TextField
          label={text.control}
          name="controlAppointmentAt"
          type="datetime-local"
          defaultValue={state.entered?.controlAppointmentAt}
          hint={text.controlHint}
          errors={errors("controlAppointmentAt")}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-protocole`} className="text-sm font-semibold">
          {text.protocol}
        </label>
        <select
          id={`${id}-protocole`}
          name="protocolId"
          defaultValue={state.entered?.protocolId ?? ""}
          className={selectClasses}
        >
          <option value="">{text.protocolAuto}</option>
          {protocols.map((protocol) => (
            <option key={protocol.id} value={protocol.id}>
              {protocol.name}
            </option>
          ))}
        </select>
        {protocols.length === 0 ? (
          <p className="text-[13px] text-ink-muted">{text.noProtocols}</p>
        ) : null}
      </div>
      <ActionMessage state={{ error: state.error }} />
      <div>
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {text.submit}
        </Button>
      </div>
    </form>
  );
}
