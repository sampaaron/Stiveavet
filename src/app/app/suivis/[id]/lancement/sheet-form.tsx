"use client";

import { Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useActionState, useId, useState } from "react";

import type { LaunchSheet } from "@/domains/suivis/lancement";
import { MAX_FIRST_CONTACT_HOURS } from "@/domains/suivis/plan";
import type { SheetInput } from "@/domains/suivis/plan";
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

  const [responsible, setResponsible] = useState(
    followup.responsibleMembershipId,
  );
  const [firstHours, setFirstHours] = useState(followup.firstContactHours);
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
          title="Premier message de Numa"
          description="Numa se présente comme l'assistante IA du cabinet et demande l'accord du propriétaire avant tout suivi clinique."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Heures après l'intervention"
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_FIRST_CONTACT_HOURS}
              value={Number.isFinite(firstHours) ? firstHours : ""}
              onChange={(event) => setFirstHours(Number(event.target.value))}
              hint={
                firstContact
                  ? `Suggestion courante : 3 à 4 h. Ici : ${formatDateTime(firstContact)}${firstContact.getTime() < sheet.generatedAt.getTime() ? ", donc dès le lancement" : ""}.`
                  : "Suggestion courante : 3 à 4 h, à adapter librement."
              }
            />
            <div className="flex min-w-0 flex-col gap-1.5">
              <label
                htmlFor={`${id}-responsable`}
                className="text-sm font-semibold"
              >
                Vétérinaire responsable
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
              <p className="text-sm text-ink-muted">
                Numa écrit en son nom ; c&apos;est lui ou elle qui lance le
                suivi.
              </p>
            </div>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard
        title="Étapes et questions de Numa"
        description={
          draft
            ? "Reprises du protocole. Modifiez-les pour cet animal : le protocole du cabinet ne change pas."
            : "Les étapes passées restent telles quelles ; les étapes à venir remplacent les précédentes."
        }
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
        title="Signes d'alerte"
        description="Validés par le vétérinaire. Numa ne pose jamais de diagnostic : elle signale et, en cas de doute, escalade."
      >
        <AlertsEditor alerts={alerts} setAlerts={setAlerts} />
      </SectionCard>

      <SectionCard
        title="Traitements"
        description="Un traitement importé de dr.veto n'est rappelé au propriétaire qu'après validation par un vétérinaire. Numa ne modifie jamais une posologie."
      >
        {sheet.treatments.length === 0 && added.length === 0 ? (
          <p className="text-sm text-ink-muted">Aucun traitement en cours.</p>
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
                    {isRemoved ? " (retiré à l'enregistrement)" : ""}
                  </p>
                  <p className="text-sm text-ink-muted">
                    {treatment.instructions}
                  </p>
                  <p className="mt-1 text-sm">
                    {treatment.validatedAt ? (
                      <span className="inline-flex items-center gap-1 font-medium text-brand-ink">
                        <ShieldCheck aria-hidden="true" className="size-4" />
                        Validé par {treatment.validatedBy}
                      </span>
                    ) : (
                      <span className="font-medium text-watch">
                        Importé de dr.veto, à valider
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
                      Je valide ce traitement : {treatment.name}
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
                    aria-label={`${isRemoved ? "Garder" : "Retirer"} le traitement ${treatment.name}`}
                  >
                    {isRemoved ? "Garder" : "Retirer"}
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
                  label={`Nouveau traitement ${index + 1}`}
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
                  label={`Posologie du traitement ${index + 1}`}
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
                <p className="text-sm text-ink-muted">
                  Validé par vous à l&apos;enregistrement.
                </p>
                <Button
                  variant="quiet"
                  size="sm"
                  onClick={() =>
                    setAdded((list) =>
                      list.filter((item) => item.key !== treatment.key),
                    )
                  }
                  icon={<Trash2 aria-hidden="true" className="size-3.5" />}
                  aria-label={`Retirer le nouveau traitement ${index + 1}`}
                >
                  Retirer
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
              Ajouter un traitement
            </Button>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="Rendez-vous de contrôle">
        <TextField
          label="Date et heure du contrôle"
          type="datetime-local"
          value={control}
          onChange={(event) => setControl(event.target.value)}
          hint="Le suivi automatisé s'arrêtera à cette date ; la discussion restera ouverte. Laissez vide si aucun contrôle n'est prévu."
        />
      </SectionCard>

      <ActionMessage state={state} />
      {draft && pendingTreatments > 0 ? (
        <p className="text-sm text-ink-muted">
          {pendingTreatments === 1
            ? "1 traitement importé n'est pas encore validé : il ne sera pas rappelé."
            : `${pendingTreatments} traitements importés ne sont pas encore validés : ils ne seront pas rappelés.`}
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
            Lancer le suivi
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
          {draft ? "Enregistrer le brouillon" : "Enregistrer les modifications"}
        </Button>
      </div>
      {draft && !rights.canLaunch ? (
        <p className="text-sm text-ink-muted">
          Le suivi sera lancé par {followup.responsibleName}, vétérinaire
          responsable.
        </p>
      ) : null}
    </form>
  );
}
