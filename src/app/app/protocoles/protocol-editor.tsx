"use client";

import { Plus, Trash2 } from "lucide-react";
import { useActionState, useId, useState } from "react";

import {
  ALERT_LEVELS,
  ALERT_LEVEL_LABELS,
  CATEGORY_LABELS,
  MAX_ALERTS,
  MAX_STEPS,
  PROTOCOL_CATEGORIES,
  PROTOCOL_SPECIES,
  SPECIES_LABELS,
  STEP_KINDS,
  STEP_KIND_LABELS,
} from "@/domains/protocoles/content";
import type { ProtocolContent } from "@/domains/protocoles/content";
import { Button } from "@/ui/button";
import { SectionCard } from "@/ui/card";
import { TextField } from "@/ui/text-field";

import { ActionMessage, selectClasses } from "../action-message";
import { initialActionState } from "../action-state";

import { saveProtocolAction } from "./actions";

const textareaClasses =
  "min-h-20 rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2 text-[15px] text-ink focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand";

type Step = ProtocolContent["steps"][number] & { key: number };
type Alert = ProtocolContent["alerts"][number] & { key: number };
type Unit = "hours" | "days";

let nextKey = 0;
const keyed = <T,>(item: T) => ({ ...item, key: nextKey++ });

/** Délai affiché en jours quand il tombe juste, sinon en heures. */
function splitOffset(offsetHours: number): { value: number; unit: Unit } {
  return offsetHours >= 24 && offsetHours % 24 === 0
    ? { value: offsetHours / 24, unit: "days" }
    : { value: offsetHours, unit: "hours" };
}

type EditorProps =
  | {
      mode: "create";
      scopes: { value: "cabinet" | "personal"; label: string }[];
      initial?: undefined;
      protocolId?: undefined;
    }
  | {
      mode: "update";
      protocolId: string;
      initial: ProtocolContent;
      scopes?: undefined;
    };

const EMPTY: ProtocolContent = {
  name: "",
  category: "surgery",
  species: "both",
  description: "",
  durationDays: 10,
  steps: [{ offsetHours: 4, kind: "message", content: "" }],
  alerts: [{ level: "urgent", description: "" }],
};

/**
 * Éditeur d'un protocole. Enregistrer crée toujours une nouvelle version : les suivis déjà
 * lancés gardent la leur. Le serveur revalide tout le contenu.
 */
export function ProtocolEditor(props: EditorProps) {
  const initial = props.initial ?? EMPTY;
  const [state, action, pending] = useActionState(
    saveProtocolAction,
    initialActionState,
  );
  const id = useId();
  const [name, setName] = useState(initial.name);
  const [category, setCategory] = useState(initial.category);
  const [species, setSpecies] = useState(initial.species);
  const [description, setDescription] = useState(initial.description);
  const [durationDays, setDurationDays] = useState(initial.durationDays);
  const [steps, setSteps] = useState<Step[]>(() => initial.steps.map(keyed));
  const [alerts, setAlerts] = useState<Alert[]>(() =>
    initial.alerts.map(keyed),
  );

  const payload = JSON.stringify({
    name,
    category,
    species,
    description,
    durationDays,
    steps: steps.map(({ offsetHours, kind, content }) => ({
      offsetHours,
      kind,
      content,
    })),
    alerts: alerts.map(({ level, description: text }) => ({
      level,
      description: text,
    })),
  } satisfies ProtocolContent);

  const updateStep = (key: number, patch: Partial<Step>) =>
    setSteps((list) =>
      list.map((step) => (step.key === key ? { ...step, ...patch } : step)),
    );
  const updateAlert = (key: number, patch: Partial<Alert>) =>
    setAlerts((list) =>
      list.map((alert) => (alert.key === key ? { ...alert, ...patch } : alert)),
    );

  return (
    <form action={action} className="grid gap-6" noValidate>
      <input type="hidden" name="mode" value={props.mode} />
      <input type="hidden" name="payload" value={payload} />
      {props.mode === "update" ? (
        <input type="hidden" name="protocolId" value={props.protocolId} />
      ) : null}

      <SectionCard title="Description">
        <div className="grid gap-4">
          {props.mode === "create" && props.scopes.length > 1 ? (
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-semibold">
                Protocole destiné à
              </legend>
              {props.scopes.map((scope, index) => (
                <label
                  key={scope.value}
                  className="flex items-center gap-2 text-sm"
                >
                  <input
                    type="radio"
                    name="scope"
                    value={scope.value}
                    defaultChecked={index === 0}
                    className="size-4 accent-[var(--color-brand)]"
                  />
                  {scope.label}
                </label>
              ))}
            </fieldset>
          ) : props.mode === "create" ? (
            <input type="hidden" name="scope" value={props.scopes[0]?.value} />
          ) : null}
          <TextField
            label="Nom du protocole"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={120}
            required
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor={`${id}-categorie`}
                className="text-sm font-semibold"
              >
                Type
              </label>
              <select
                id={`${id}-categorie`}
                className={selectClasses}
                value={category}
                onChange={(event) =>
                  setCategory(event.target.value as ProtocolContent["category"])
                }
              >
                {PROTOCOL_CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {CATEGORY_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${id}-espece`} className="text-sm font-semibold">
                Espèce
              </label>
              <select
                id={`${id}-espece`}
                className={selectClasses}
                value={species}
                onChange={(event) =>
                  setSpecies(event.target.value as ProtocolContent["species"])
                }
              >
                {PROTOCOL_SPECIES.map((value) => (
                  <option key={value} value={value}>
                    {SPECIES_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
            <TextField
              label="Durée du suivi (jours)"
              type="number"
              inputMode="numeric"
              min={1}
              max={90}
              value={durationDays}
              onChange={(event) => setDurationDays(Number(event.target.value))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`${id}-description`}
              className="text-sm font-semibold"
            >
              Description
            </label>
            <textarea
              id={`${id}-description`}
              className={textareaClasses}
              value={description}
              maxLength={2000}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Étapes"
        description="Ce que Numa envoie ou demande, et quand. Elles seront rangées dans l'ordre chronologique."
      >
        <ol className="grid gap-4">
          {steps.map((step, index) => {
            const offset = splitOffset(step.offsetHours);
            return (
              <li
                key={step.key}
                className="grid gap-3 rounded-[var(--radius-control)] border border-line p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">
                    Étape {index + 1}
                  </span>
                  <Button
                    variant="quiet"
                    size="sm"
                    disabled={steps.length <= 1}
                    onClick={() =>
                      setSteps((list) => list.filter((s) => s.key !== step.key))
                    }
                    icon={<Trash2 aria-hidden="true" className="size-3.5" />}
                    aria-label={`Retirer l'étape ${index + 1}`}
                  >
                    Retirer
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <TextField
                    label="Délai"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={offset.value}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      updateStep(step.key, {
                        offsetHours:
                          offset.unit === "days" ? value * 24 : value,
                      });
                    }}
                  />
                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor={`${id}-unite-${step.key}`}
                      className="text-sm font-semibold"
                    >
                      Unité
                    </label>
                    <select
                      id={`${id}-unite-${step.key}`}
                      className={selectClasses}
                      value={offset.unit}
                      onChange={(event) =>
                        updateStep(step.key, {
                          offsetHours:
                            event.target.value === "days"
                              ? offset.value * 24
                              : offset.value,
                        })
                      }
                    >
                      <option value="hours">heures après</option>
                      <option value="days">jours après</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor={`${id}-type-${step.key}`}
                      className="text-sm font-semibold"
                    >
                      Type d&apos;étape
                    </label>
                    <select
                      id={`${id}-type-${step.key}`}
                      className={selectClasses}
                      value={step.kind}
                      onChange={(event) =>
                        updateStep(step.key, {
                          kind: event.target.value as Step["kind"],
                        })
                      }
                    >
                      {STEP_KINDS.map((value) => (
                        <option key={value} value={value}>
                          {STEP_KIND_LABELS[value]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor={`${id}-contenu-${step.key}`}
                    className="text-sm font-semibold"
                  >
                    Contenu de l&apos;étape {index + 1}
                  </label>
                  <textarea
                    id={`${id}-contenu-${step.key}`}
                    className={textareaClasses}
                    value={step.content}
                    maxLength={1000}
                    onChange={(event) =>
                      updateStep(step.key, { content: event.target.value })
                    }
                  />
                </div>
              </li>
            );
          })}
        </ol>
        <div className="mt-4">
          <Button
            variant="secondary"
            size="sm"
            disabled={steps.length >= MAX_STEPS}
            onClick={() =>
              setSteps((list) => [
                ...list,
                keyed({
                  offsetHours: (list.at(-1)?.offsetHours ?? 0) + 24,
                  kind: "question" as const,
                  content: "",
                }),
              ])
            }
            icon={<Plus aria-hidden="true" className="size-3.5" />}
          >
            Ajouter une étape
          </Button>
        </div>
      </SectionCard>

      <SectionCard
        title="Signes d'alerte"
        description="Validés par le vétérinaire. Numa ne pose jamais de diagnostic : elle signale et, en cas de doute, escalade."
      >
        <ul className="grid gap-4">
          {alerts.map((alert, index) => (
            <li
              key={alert.key}
              className="grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)_auto] sm:items-end"
            >
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor={`${id}-niveau-${alert.key}`}
                  className="text-sm font-semibold"
                >
                  Niveau
                </label>
                <select
                  id={`${id}-niveau-${alert.key}`}
                  className={selectClasses}
                  value={alert.level}
                  onChange={(event) =>
                    updateAlert(alert.key, {
                      level: event.target.value as Alert["level"],
                    })
                  }
                >
                  {ALERT_LEVELS.map((value) => (
                    <option key={value} value={value}>
                      {ALERT_LEVEL_LABELS[value]}
                    </option>
                  ))}
                </select>
              </div>
              <TextField
                label={`Signe d'alerte ${index + 1}`}
                value={alert.description}
                maxLength={300}
                onChange={(event) =>
                  updateAlert(alert.key, { description: event.target.value })
                }
              />
              <Button
                variant="quiet"
                size="sm"
                className="h-11"
                disabled={alerts.length <= 1}
                onClick={() =>
                  setAlerts((list) => list.filter((a) => a.key !== alert.key))
                }
                icon={<Trash2 aria-hidden="true" className="size-3.5" />}
                aria-label={`Retirer le signe d'alerte ${index + 1}`}
              >
                Retirer
              </Button>
            </li>
          ))}
        </ul>
        <div className="mt-4">
          <Button
            variant="secondary"
            size="sm"
            disabled={alerts.length >= MAX_ALERTS}
            onClick={() =>
              setAlerts((list) => [
                ...list,
                keyed({ level: "watch" as const, description: "" }),
              ])
            }
            icon={<Plus aria-hidden="true" className="size-3.5" />}
          >
            Ajouter un signe d&apos;alerte
          </Button>
        </div>
      </SectionCard>

      {props.mode === "update" ? (
        <TextField
          label="Ce qui change dans cette version"
          name="changeNote"
          maxLength={500}
          hint="Visible dans l'historique. Les suivis déjà lancés gardent leur version."
        />
      ) : null}

      <ActionMessage state={state} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {props.mode === "update"
            ? "Enregistrer une nouvelle version"
            : "Créer le protocole"}
        </Button>
      </div>
    </form>
  );
}
