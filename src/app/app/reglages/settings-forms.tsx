"use client";

import { useActionState, useId } from "react";

import { Button } from "@/ui/button";
import { TextField } from "@/ui/text-field";

import { ActionMessage, selectClasses } from "../action-message";
import { initialActionState } from "../action-state";

import {
  addContactAction,
  addOnCallAction,
  applyDefaultsAction,
  completeTeamStepAction,
  connectAction,
  createTestFollowupAction,
  disconnectAction,
  removeContactAction,
  removeOnCallAction,
  saveAlertSettingsAction,
  saveInstructionsAction,
  saveMessageWindowsAction,
} from "./actions";

type Option = { value: string; label: string };

const textareaClasses =
  "min-h-28 rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2.5 text-[15px] text-ink focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand";
const timeClasses =
  "h-10 w-32 rounded-[var(--radius-control)] border border-line bg-surface px-2 text-[15px] text-ink tabular-nums focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand";

function SubmitButton({
  pending,
  children,
  variant = "secondary",
  size,
  label,
}: {
  pending: boolean;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "quiet";
  size?: "sm" | "md";
  label?: string;
}) {
  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      disabled={pending}
      aria-busy={pending}
      aria-label={label}
    >
      {children}
    </Button>
  );
}

export function ApplyDefaultsForm({ label }: { label: string }) {
  const [state, action, pending] = useActionState(
    applyDefaultsAction,
    initialActionState,
  );
  return (
    <form action={action} className="grid gap-2">
      <div>
        <SubmitButton pending={pending} variant="primary">
          {label}
        </SubmitButton>
      </div>
      <ActionMessage state={state} />
    </form>
  );
}

export function MessageWindowsForm({
  days,
}: {
  days: {
    weekday: number;
    label: string;
    enabled: boolean;
    startsAt: string;
    endsAt: string;
  }[];
}) {
  const [state, action, pending] = useActionState(
    saveMessageWindowsAction,
    initialActionState,
  );
  return (
    <form action={action} className="grid gap-4">
      <fieldset className="grid gap-2">
        <legend className="sr-only">Jours et heures d&apos;envoi</legend>
        {days.map((day) => (
          <div
            key={day.weekday}
            className="flex flex-wrap items-center gap-x-4 gap-y-2"
          >
            <label className="flex w-32 items-center gap-2.5 text-sm font-semibold">
              <input
                type="checkbox"
                name={`day-${day.weekday}`}
                defaultChecked={day.enabled}
                className="size-4 accent-[var(--color-brand)]"
              />
              {day.label}
            </label>
            <label className="flex items-center gap-2 text-sm text-ink-muted">
              de
              <input
                type="time"
                name={`start-${day.weekday}`}
                defaultValue={day.startsAt}
                aria-label={`${day.label} : début`}
                className={timeClasses}
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-ink-muted">
              à
              <input
                type="time"
                name={`end-${day.weekday}`}
                defaultValue={day.endsAt}
                aria-label={`${day.label} : fin`}
                className={timeClasses}
              />
            </label>
          </div>
        ))}
      </fieldset>
      <ActionMessage state={state} />
      <div>
        <SubmitButton pending={pending}>Enregistrer les horaires</SubmitButton>
      </div>
    </form>
  );
}

export function InstructionsForm({
  period,
  label,
  value,
}: {
  period: string;
  label: string;
  value: string;
}) {
  const [state, action, pending] = useActionState(
    saveInstructionsAction,
    initialActionState,
  );
  const id = useId();
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="period" value={period} />
      <label htmlFor={`${id}-consignes`} className="text-sm font-semibold">
        {label}
      </label>
      <textarea
        id={`${id}-consignes`}
        name="instructions"
        defaultValue={value}
        required
        minLength={10}
        maxLength={1500}
        className={textareaClasses}
      />
      <ActionMessage state={state} />
      <div>
        <SubmitButton
          pending={pending}
          size="sm"
          label={`Enregistrer : ${label}`}
        >
          Enregistrer
        </SubmitButton>
      </div>
    </form>
  );
}

export function ContactForm() {
  const [state, action, pending] = useActionState(
    addContactAction,
    initialActionState,
  );
  return (
    <form action={action} className="grid gap-4" noValidate>
      <div className="grid gap-4 md:grid-cols-2">
        <TextField
          label="Libellé du contact"
          name="label"
          autoComplete="off"
          required
          maxLength={80}
          hint="Par exemple : accueil du cabinet, clinique de garde partenaire."
        />
        <TextField
          label="Numéro"
          name="phone"
          type="tel"
          autoComplete="off"
          required
          maxLength={20}
        />
      </div>
      <ActionMessage state={state} />
      <div>
        <SubmitButton pending={pending}>Ajouter le contact</SubmitButton>
      </div>
    </form>
  );
}

export function RemoveContactForm({
  id,
  label,
}: {
  id: string;
  label: string;
}) {
  const [state, action, pending] = useActionState(
    removeContactAction,
    initialActionState,
  );
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="id" value={id} />
      <SubmitButton
        pending={pending}
        variant="quiet"
        size="sm"
        label={`Retirer le contact ${label}`}
      >
        Retirer
      </SubmitButton>
      <ActionMessage state={state} />
    </form>
  );
}

export function AlertSettingsForm({
  escalationDelayMinutes,
  photoAnalysisEnabled,
  choices,
}: {
  escalationDelayMinutes: number;
  photoAnalysisEnabled: boolean;
  choices: Option[];
}) {
  const [state, action, pending] = useActionState(
    saveAlertSettingsAction,
    initialActionState,
  );
  const id = useId();
  return (
    <form action={action} className="grid gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-delai`} className="text-sm font-semibold">
          Délai avant d&apos;alerter les autres vétérinaires
        </label>
        <select
          id={`${id}-delai`}
          name="escalationDelayMinutes"
          defaultValue={String(escalationDelayMinutes)}
          aria-describedby={`${id}-delai-aide`}
          className={`${selectClasses} max-w-xs`}
        >
          {choices.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
        <p id={`${id}-delai-aide`} className="text-[13px] text-ink-muted">
          Sans accusé de réception d&apos;une alerte urgente dans ce délai, les
          autres vétérinaires du cabinet sont prévenus. Les consignes
          d&apos;urgence partent au propriétaire immédiatement, sans attendre.
        </p>
      </div>
      <label className="flex items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          name="photoAnalysisEnabled"
          defaultChecked={photoAnalysisEnabled}
          className="mt-0.5 size-4 accent-[var(--color-brand)]"
        />
        <span>
          <span className="block font-semibold">
            Analyse assistée des photos
          </span>
          <span className="block text-ink-muted">
            Désactivée par défaut. Numa ne fournit que des observations et des
            signaux de risque ; elle ne pose jamais de diagnostic.
          </span>
        </span>
      </label>
      <ActionMessage state={state} />
      <div>
        <SubmitButton pending={pending}>
          Enregistrer les règles d&apos;alerte
        </SubmitButton>
      </div>
    </form>
  );
}

export function OnCallForm({
  candidates,
  defaultStart,
  defaultEnd,
}: {
  candidates: Option[];
  defaultStart: string;
  defaultEnd: string;
}) {
  const [state, action, pending] = useActionState(
    addOnCallAction,
    initialActionState,
  );
  const id = useId();
  const fieldClasses = `${selectClasses} w-full`;
  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-vet`} className="text-sm font-semibold">
            Vétérinaire de garde
          </label>
          <select
            id={`${id}-vet`}
            name="membershipId"
            defaultValue=""
            className={fieldClasses}
          >
            <option value="" disabled>
              Choisir…
            </option>
            {candidates.map((candidate) => (
              <option key={candidate.value} value={candidate.value}>
                {candidate.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-debut`} className="text-sm font-semibold">
            Début
          </label>
          <input
            id={`${id}-debut`}
            type="datetime-local"
            name="startsAt"
            defaultValue={defaultStart}
            className={fieldClasses}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-fin`} className="text-sm font-semibold">
            Fin
          </label>
          <input
            id={`${id}-fin`}
            type="datetime-local"
            name="endsAt"
            defaultValue={defaultEnd}
            className={fieldClasses}
          />
        </div>
      </div>
      <ActionMessage state={state} />
      <div>
        <SubmitButton pending={pending}>Ajouter la garde</SubmitButton>
      </div>
    </form>
  );
}

export function RemoveOnCallForm({ id, label }: { id: string; label: string }) {
  const [state, action, pending] = useActionState(
    removeOnCallAction,
    initialActionState,
  );
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="id" value={id} />
      <SubmitButton
        pending={pending}
        variant="quiet"
        size="sm"
        label={`Retirer la garde ${label}`}
      >
        Retirer
      </SubmitButton>
      <ActionMessage state={state} />
    </form>
  );
}

export function ConnectForm({
  provider,
  submitLabel,
  field,
}: {
  provider: "whatsapp" | "drveto" | "payment_mandate";
  submitLabel: string;
  /** Champ à saisir (numéro, code du cabinet) ; aucun pour le mandat simulé. */
  field?: { label: string; type: "tel" | "text"; hint: string };
}) {
  const [state, action, pending] = useActionState(
    connectAction,
    initialActionState,
  );
  return (
    <form action={action} className="grid gap-3" noValidate>
      <input type="hidden" name="provider" value={provider} />
      {field ? (
        <TextField
          label={field.label}
          name="value"
          type={field.type}
          autoComplete="off"
          required
          maxLength={32}
          hint={field.hint}
          className="max-w-sm"
        />
      ) : null}
      <ActionMessage state={state} />
      <div>
        <SubmitButton pending={pending} variant="primary">
          {submitLabel}
        </SubmitButton>
      </div>
    </form>
  );
}

export function DisconnectForm({
  provider,
  label,
}: {
  provider: "whatsapp" | "drveto" | "payment_mandate";
  label: string;
}) {
  const [state, action, pending] = useActionState(
    disconnectAction,
    initialActionState,
  );
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="provider" value={provider} />
      <SubmitButton
        pending={pending}
        variant="quiet"
        size="sm"
        label={`Retirer la connexion ${label}`}
      >
        Retirer
      </SubmitButton>
      <ActionMessage state={state} />
    </form>
  );
}

export function CompleteTeamForm() {
  const [state, action, pending] = useActionState(
    completeTeamStepAction,
    initialActionState,
  );
  return (
    <form action={action} className="grid gap-2">
      <div>
        <SubmitButton pending={pending}>L&apos;équipe est prête</SubmitButton>
      </div>
      <ActionMessage state={state} />
    </form>
  );
}

export function TestFollowupForm({ protocols }: { protocols: Option[] }) {
  const [state, action, pending] = useActionState(
    createTestFollowupAction,
    initialActionState,
  );
  const id = useId();
  return (
    <form action={action} className="grid gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-protocole`} className="text-sm font-semibold">
          Protocole du suivi test
        </label>
        <select
          id={`${id}-protocole`}
          name="protocolId"
          defaultValue={protocols[0]?.value ?? ""}
          className={`${selectClasses} max-w-sm`}
        >
          {protocols.map((protocol) => (
            <option key={protocol.value} value={protocol.value}>
              {protocol.label}
            </option>
          ))}
        </select>
      </div>
      <ActionMessage state={state} />
      <div>
        <SubmitButton pending={pending} variant="primary">
          Créer le suivi test
        </SubmitButton>
      </div>
    </form>
  );
}
