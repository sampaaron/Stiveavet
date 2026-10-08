"use client";

import { Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useActionState, useId, useState } from "react";

import type { LaunchSheet } from "@/domains/suivis/lancement";
import { MAX_FIRST_CONTACT_HOURS } from "@/domains/suivis/plan";
import type { SheetInput } from "@/domains/suivis/plan";
import { useAppText, useLocale } from "@/i18n/app/client";
import { Button } from "@/ui/button";
import { SectionCard } from "@/ui/card";
import { formatDateTime } from "@/ui/format";
import { TextField } from "@/ui/text-field";

import { ActionMessage, selectClasses } from "../../../action-message";
import { initialActionState } from "../../../action-state";
import { AlertsEditor, StepsEditor, keyed } from "../../../plan-editors";
import type { EditableAlert, EditableStep } from "../../../plan-editors";
import { saveSheetAction } from "../../launch-actions";

const HOUR = 3_600_000;

type NewTreatment = { key: number; name: string; instructions: string };

type Payload = Omit<SheetInput, "controlAppointmentAt"> & {
  controlAppointmentAt: string;
};

/**
 * Fiche de lancement : tout est modifiable avant le lancement ; sur un suivi lancé, seules les
 * étapes à venir changent. Le serveur revalide tout et décide des droits.
 */
export function SheetForm({
  sheet,
  controlInput,
}: {
  sheet: LaunchSheet;
  /** Date de contrôle au format `datetime-local`, à l'heure de Paris. */
  controlInput: string;
}) {
  const { followup, rights } = sheet;
  const draft = followup.status === "draft";
  const procedureAt = followup.procedureAt;
  const [state, action, pending] = useActionState(
    saveSheetAction,
    initialActionState,
  );
  const id = useId();
  const t = useAppText();
  const locale = useLocale();
  const text = t.followups.form;

  const [responsible, setResponsible] = useState(
    followup.responsibleMembershipId,
  );
  const [firstHours, setFirstHours] = useState(followup.firstContactHours);
  const second = sheet.contacts.find((contact) => contact.role === "secondary");
  const [secondActive, setSecondActive] = useState(second?.active ?? false);
  const [optIn, setOptIn] = useState(() =>
    sheet.contacts
      .filter((contact) => contact.active)
      .every((contact) => contact.optedIn),
  );
  const [control, setControl] = useState(controlInput);
  const [steps, setSteps] = useState<EditableStep[]>(() =>
    sheet.steps
      .filter((step) => !step.locked)
      .map(({ offsetHours, kind, content }) =>
        keyed({ offsetHours, kind, content }),
      ),
  );
  const [alerts, setAlerts] = useState<EditableAlert[]>(() =>
    sheet.alerts.map(keyed),
  );
  const [validated, setValidated] = useState<string[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [added, setAdded] = useState<NewTreatment[]>([]);
  const locked = sheet.steps
    .filter((step) => step.locked)
    .map(({ offsetHours, kind, content }) => ({ offsetHours, kind, content }));

  const payload: Payload = {
    responsibleMembershipId: draft ? responsible : undefined,
    firstContactHours: draft ? firstHours : undefined,
    secondContactActive: draft && second ? secondActive : undefined,
    whatsappOptIn: draft && !followup.isTest ? optIn : undefined,
    controlAppointmentAt: control,
    steps: steps.map(({ offsetHours, kind, content }) => ({
      offsetHours,
      kind,
      content,
    })),
    alerts: alerts.map(({ level, description }) => ({ level, description })),
    validateTreatmentIds: validated,
    removeTreatmentIds: removed,
    addTreatments: added.map(({ name, instructions }) => ({
      name,
      instructions,
    })),
  };

  const toggle =
    (setter: typeof setValidated) => (treatmentId: string, on: boolean) =>
      setter((list) =>
        on
          ? [...list, treatmentId]
          : list.filter((value) => value !== treatmentId),
      );
  const toggleValidated = toggle(setValidated);
  const toggleRemoved = toggle(setRemoved);
  const firstContact = Number.isFinite(firstHours)
    ? new Date(procedureAt.getTime() + firstHours * HOUR)
    : null;
  const pendingTreatments = sheet.treatments.filter(
    (treatment) =>
      !treatment.validatedAt &&
      !validated.includes(treatment.id) &&
      !removed.includes(treatment.id),
  ).length;

  return (
    <form action={action} className="grid gap-6" noValidate>
      <input type="hidden" name="followupId" value={followup.id} />
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />

      {draft ? (
        <SectionCard
          title={text.firstMessageTitle}
          description={text.firstMessageDescription}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label={text.hoursLabel}
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_FIRST_CONTACT_HOURS}
              value={Number.isFinite(firstHours) ? firstHours : ""}
              onChange={(event) => setFirstHours(Number(event.target.value))}
              hint={
                firstContact
                  ? (firstContact.getTime() < sheet.generatedAt.getTime()
                      ? text.firstContactAtLaunch
                      : text.firstContactAt)(
                      formatDateTime(firstContact, locale),
                    )
                  : text.firstContactDefault
              }
            />
            <div className="flex min-w-0 flex-col gap-1.5">
              <label
                htmlFor={`${id}-responsable`}
                className="text-sm font-semibold"
              >
                {text.responsibleLabel}
              </label>
              <select
                id={`${id}-responsable`}
                className={`${selectClasses} w-full min-w-0`}
                value={responsible}
                onChange={(event) => setResponsible(event.target.value)}
              >
                {sheet.vetOptions.map((vet) => (
                  <option key={vet.membershipId} value={vet.membershipId}>
                    {vet.name}
                  </option>
                ))}
              </select>
              <p className="text-sm text-ink-muted">{text.responsibleHint}</p>
            </div>
          </div>
          {second ? (
            <label className="mt-4 flex items-start gap-3 rounded-[var(--radius-control)] border border-line p-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-[var(--color-brand)]"
                checked={secondActive}
                onChange={(event) => setSecondActive(event.target.checked)}
              />
              <span>
                <span className="font-semibold">
                  {text.includeSecond(second.name)}
                </span>
                <span className="block text-ink-muted">{text.secondHint}</span>
              </span>
            </label>
          ) : null}
          {followup.isTest ? null : (
            <label className="mt-4 flex items-start gap-3 rounded-[var(--radius-control)] border border-line p-3 text-sm">
              <input
                type="checkbox"
                name="whatsappOptIn"
                className="mt-0.5 size-4 accent-[var(--color-brand)]"
                checked={optIn}
                onChange={(event) => setOptIn(event.target.checked)}
              />
              <span>
                <span className="font-semibold">
                  {text.optInLabel(second && secondActive ? 2 : 1)}
                </span>
                <span className="block text-ink-muted">{text.optInHint}</span>
              </span>
            </label>
          )}
        </SectionCard>
      ) : null}

      <SectionCard
        title={text.stepsTitle}
        description={draft ? text.stepsDraft : text.stepsLive}
      >
        <StepsEditor
          steps={steps}
          setSteps={setSteps}
          minSteps={draft ? 1 : 0}
          procedureAt={procedureAt}
          locked={locked}
        />
      </SectionCard>

      <SectionCard
        title={text.alertsTitle}
        description={text.alertsDescription}
      >
        <AlertsEditor alerts={alerts} setAlerts={setAlerts} />
      </SectionCard>

      <SectionCard
        title={text.treatmentsTitle}
        description={text.treatmentsDescription}
      >
        {sheet.treatments.length === 0 && added.length === 0 ? (
          <p className="text-sm text-ink-muted">{text.noTreatments}</p>
        ) : null}
        <ul className="grid gap-3">
          {sheet.treatments.map((treatment) => {
            const isRemoved = removed.includes(treatment.id);
            return (
              <li
                key={treatment.id}
                className="grid gap-2 rounded-[var(--radius-control)] border border-line p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"
              >
                <div className={isRemoved ? "opacity-60" : undefined}>
                  <p className="font-semibold">
                    {treatment.name}
                    {isRemoved ? text.removedSuffix : ""}
                  </p>
                  <p className="text-sm text-ink-muted">
                    {treatment.instructions}
                  </p>
                  <p className="mt-1 text-sm">
                    {treatment.validatedAt ? (
                      <span className="inline-flex items-center gap-1 font-medium text-brand-ink">
                        <ShieldCheck aria-hidden="true" className="size-4" />
                        {text.validatedBy(treatment.validatedBy ?? "")}
                      </span>
                    ) : (
                      <span className="font-medium text-watch">
                        {text.toValidate}
                      </span>
                    )}
                  </p>
                  {!treatment.validatedAt && rights.canSteer && !isRemoved ? (
                    <label className="mt-2 flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4 accent-[var(--color-brand)]"
                        checked={validated.includes(treatment.id)}
                        onChange={(event) =>
                          toggleValidated(treatment.id, event.target.checked)
                        }
                      />
                      {text.validateTreatment(treatment.name)}
                    </label>
                  ) : null}
                </div>
                {rights.canSteer ? (
                  <Button
                    variant="quiet"
                    size="sm"
                    onClick={() => toggleRemoved(treatment.id, !isRemoved)}
                    icon={
                      isRemoved ? null : (
                        <Trash2 aria-hidden="true" className="size-3.5" />
                      )
                    }
                    aria-label={(isRemoved
                      ? text.keepTreatmentLabel
                      : text.removeTreatmentLabel)(treatment.name)}
                  >
                    {isRemoved ? text.keep : text.remove}
                  </Button>
                ) : null}
              </li>
            );
          })}
          {added.map((treatment, index) => (
            <li
              key={treatment.key}
              className="grid gap-3 rounded-[var(--radius-control)] border border-line p-4"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  label={text.newTreatment(index + 1)}
                  value={treatment.name}
                  maxLength={120}
                  onChange={(event) =>
                    setAdded((list) =>
                      list.map((item) =>
                        item.key === treatment.key
                          ? { ...item, name: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
                <TextField
                  label={text.newInstructions(index + 1)}
                  value={treatment.instructions}
                  maxLength={300}
                  onChange={(event) =>
                    setAdded((list) =>
                      list.map((item) =>
                        item.key === treatment.key
                          ? { ...item, instructions: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-ink-muted">{text.newValidated}</p>
                <Button
                  variant="quiet"
                  size="sm"
                  onClick={() =>
                    setAdded((list) =>
                      list.filter((item) => item.key !== treatment.key),
                    )
                  }
                  icon={<Trash2 aria-hidden="true" className="size-3.5" />}
                  aria-label={text.removeNewLabel(index + 1)}
                >
                  {text.remove}
                </Button>
              </div>
            </li>
          ))}
        </ul>
        {rights.canSteer ? (
          <div className="mt-4">
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                setAdded((list) => [
                  ...list,
                  keyed({ name: "", instructions: "" }),
                ])
              }
              icon={<Plus aria-hidden="true" className="size-3.5" />}
            >
              {text.addTreatment}
            </Button>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title={text.controlTitle}>
        <TextField
          label={text.controlLabel}
          type="datetime-local"
          value={control}
          onChange={(event) => setControl(event.target.value)}
          hint={text.controlHint}
        />
      </SectionCard>

      <ActionMessage state={state} />
      {draft && pendingTreatments > 0 ? (
        <p className="text-sm text-ink-muted">
          {text.pendingTreatments(pendingTreatments)}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {draft &&
        rights.canLaunch &&
        responsible === followup.responsibleMembershipId ? (
          <Button
            type="submit"
            name="intent"
            value="launch"
            disabled={pending}
            aria-busy={pending}
          >
            {text.launch}
          </Button>
        ) : null}
        <Button
          type="submit"
          name="intent"
          value="save"
          variant={draft && rights.canLaunch ? "secondary" : "primary"}
          disabled={pending}
          aria-busy={pending}
        >
          {draft ? text.saveDraft : text.saveChanges}
        </Button>
      </div>
      {draft && !rights.canLaunch ? (
        <p className="text-sm text-ink-muted">
          {text.launchedBy(followup.responsibleName)}
        </p>
      ) : null}
    </form>
  );
}
