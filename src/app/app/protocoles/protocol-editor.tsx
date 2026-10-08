"use client";

import { useActionState, useId, useState } from "react";

import {
  CATEGORY_LABELS,
  PROTOCOL_CATEGORIES,
  PROTOCOL_SPECIES,
  SPECIES_LABELS,
} from "@/domains/protocoles/content";
import type { ProtocolContent } from "@/domains/protocoles/content";
import { Button } from "@/ui/button";
import { SectionCard } from "@/ui/card";
import { TextField } from "@/ui/text-field";

import { ActionMessage, selectClasses } from "../action-message";
import { initialActionState } from "../action-state";
import {
  AlertsEditor,
  StepsEditor,
  keyed,
  textareaClasses,
} from "../plan-editors";
import type { EditableAlert, EditableStep } from "../plan-editors";

import { saveProtocolAction } from "./actions";

type Step = EditableStep;
type Alert = EditableAlert;

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
        <StepsEditor steps={steps} setSteps={setSteps} />
      </SectionCard>

      <SectionCard
        title="Signes d'alerte"
        description="Validés par le vétérinaire. Numa ne pose jamais de diagnostic : elle signale et, en cas de doute, escalade."
      >
        <AlertsEditor alerts={alerts} setAlerts={setAlerts} />
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
