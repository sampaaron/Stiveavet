"use client";

import { Lock, Plus, Trash2 } from "lucide-react";
import { useId } from "react";
import type { Dispatch, SetStateAction } from "react";

import {
  ALERT_LEVELS,
  ALERT_LEVEL_LABELS,
  MAX_ALERTS,
  MAX_STEPS,
  STEP_KINDS,
  STEP_KIND_LABELS,
} from "@/domains/protocoles/content";
import type { ProtocolContent } from "@/domains/protocoles/content";
import { Button } from "@/ui/button";
import { formatDateTime } from "@/ui/format";
import { TextField } from "@/ui/text-field";

import { selectClasses } from "./action-message";

/**
 * Éditeurs d'étapes et de signes d'alerte, partagés par l'éditeur de protocole et la fiche de
 * lancement d'un suivi. Le serveur revalide toujours le contenu.
 */

export const textareaClasses =
  "min-h-20 rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2 text-[15px] text-ink focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand";

export type EditableStep = ProtocolContent["steps"][number] & { key: number };
export type EditableAlert = ProtocolContent["alerts"][number] & {
  key: number;
};
type Unit = "hours" | "days";

let nextKey = 0;
export const keyed = <T,>(item: T) => ({ ...item, key: nextKey++ });

/** Délai affiché en jours quand il tombe juste, sinon en heures. */
function splitOffset(offsetHours: number): { value: number; unit: Unit } {
  return offsetHours >= 24 && offsetHours % 24 === 0
    ? { value: offsetHours / 24, unit: "days" }
    : { value: offsetHours, unit: "hours" };
}

const HOUR = 3_600_000;

export function StepsEditor({
  steps,
  setSteps,
  minSteps = 1,
  procedureAt,
  locked = [],
}: {
  steps: EditableStep[];
  setSteps: Dispatch<SetStateAction<EditableStep[]>>;
  minSteps?: number;
  /** Fiche d'un suivi : affiche la date prévue de chaque étape. */
  procedureAt?: Date;
  /** Étapes passées d'un suivi lancé : affichées, jamais modifiables. */
  locked?: ProtocolContent["steps"];
}) {
  const id = useId();
  const total = locked.length + steps.length;
  const update = (key: number, patch: Partial<EditableStep>) =>
    setSteps((list) =>
      list.map((step) => (step.key === key ? { ...step, ...patch } : step)),
    );
  const dueLabel = (offsetHours: number) =>
    procedureAt && Number.isFinite(offsetHours)
      ? `Prévue le ${formatDateTime(new Date(procedureAt.getTime() + offsetHours * HOUR))}`
      : null;

  return (
    <>
      <ol className="grid gap-4">
        {locked.map((step, index) => (
          <li
            key={`passee-${index}`}
            className="grid gap-1 rounded-[var(--radius-control)] border border-line bg-canvas-subtle p-4 text-sm"
          >
            <span className="flex items-center gap-1.5 font-semibold">
              <Lock aria-hidden="true" className="size-3.5" />
              Étape passée · {STEP_KIND_LABELS[step.kind]}
            </span>
            {dueLabel(step.offsetHours) ? (
              <span className="text-ink-muted">
                {dueLabel(step.offsetHours)}
              </span>
            ) : null}
            <span>{step.content}</span>
          </li>
        ))}
        {steps.map((step, index) => {
          const offset = splitOffset(step.offsetHours);
          const number = locked.length + index + 1;
          const due = dueLabel(step.offsetHours);
          return (
            <li
              key={step.key}
              className="grid gap-3 rounded-[var(--radius-control)] border border-line p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold">
                  Étape {number}
                  {due ? (
                    <span className="ml-2 font-normal text-ink-muted">
                      {due}
                    </span>
                  ) : null}
                </span>
                <Button
                  variant="quiet"
                  size="sm"
                  disabled={steps.length <= minSteps}
                  onClick={() =>
                    setSteps((list) => list.filter((s) => s.key !== step.key))
                  }
                  icon={<Trash2 aria-hidden="true" className="size-3.5" />}
                  aria-label={`Retirer l'étape ${number}`}
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
                    update(step.key, {
                      offsetHours: offset.unit === "days" ? value * 24 : value,
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
                      update(step.key, {
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
                      update(step.key, {
                        kind: event.target.value as EditableStep["kind"],
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
                  Contenu de l&apos;étape {number}
                </label>
                <textarea
                  id={`${id}-contenu-${step.key}`}
                  className={textareaClasses}
                  value={step.content}
                  maxLength={1000}
                  onChange={(event) =>
                    update(step.key, { content: event.target.value })
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
          disabled={total >= MAX_STEPS}
          onClick={() =>
            setSteps((list) => [
              ...list,
              keyed({
                offsetHours:
                  (list.at(-1)?.offsetHours ??
                    locked.at(-1)?.offsetHours ??
                    0) + 24,
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
    </>
  );
}

export function AlertsEditor({
  alerts,
  setAlerts,
}: {
  alerts: EditableAlert[];
  setAlerts: Dispatch<SetStateAction<EditableAlert[]>>;
}) {
  const id = useId();
  const update = (key: number, patch: Partial<EditableAlert>) =>
    setAlerts((list) =>
      list.map((alert) => (alert.key === key ? { ...alert, ...patch } : alert)),
    );
  return (
    <>
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
                  update(alert.key, {
                    level: event.target.value as EditableAlert["level"],
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
                update(alert.key, { description: event.target.value })
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
    </>
  );
}
