"use client";

import { useActionState, useId, useState } from "react";

import { useAppText } from "@/i18n/app/client";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { TextField } from "@/ui/text-field";

import { ActionMessage, selectClasses } from "../action-message";

import { createAnimalAction, updateAnimalAction } from "./actions";
import type {
  OwnerDefaults,
  PatientDefaults,
  PatientFormState,
} from "./actions";

export type { OwnerDefaults, PatientDefaults };

const EMPTY_OWNER: OwnerDefaults = {
  id: null,
  fullName: "",
  phone: "",
  email: "",
  language: "fr",
};

const initialState: PatientFormState = {};

function Select({
  label,
  name,
  defaultValue,
  options,
  error,
}: {
  label: string;
  name: string;
  defaultValue: string;
  options: { value: string; label: string }[];
  error?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <select
        id={id}
        name={name}
        defaultValue={defaultValue}
        className={selectClasses}
        aria-invalid={error ? true : undefined}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function OwnerFields({
  index,
  owner,
  fields,
}: {
  index: number;
  owner: OwnerDefaults;
  fields: Record<string, string>;
}) {
  const t = useAppText();
  const text = t.patients.form;
  const name = (leaf: string) => `owner${index}.${leaf}`;
  const errors = (leaf: string) => {
    const message = fields[name(leaf)];
    return message ? [message] : undefined;
  };
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {owner.id ? (
        <input type="hidden" name={name("id")} value={owner.id} />
      ) : null}
      <TextField
        label={text.ownerName}
        name={name("fullName")}
        defaultValue={owner.fullName}
        autoComplete="off"
        required
        maxLength={160}
        errors={errors("fullName")}
      />
      <TextField
        label={text.phone}
        name={name("phone")}
        type="tel"
        inputMode="tel"
        defaultValue={owner.phone}
        autoComplete="off"
        required
        maxLength={30}
        hint={text.phoneHint}
        errors={errors("phone")}
      />
      <TextField
        label={text.email}
        name={name("email")}
        type="email"
        defaultValue={owner.email}
        autoComplete="off"
        maxLength={254}
        hint={text.emailHint}
        errors={errors("email")}
      />
      <Select
        label={text.language}
        name={name("language")}
        defaultValue={owner.language}
        options={[
          { value: "fr", label: text.languages.fr },
          { value: "en", label: text.languages.en },
        ]}
      />
    </div>
  );
}

/** Saisie d'un animal et de ses propriétaires (création ou modification). */
export function PatientForm({
  animalId,
  defaults,
  showNotes,
}: {
  /** Absent : création. */
  animalId?: string;
  defaults?: PatientDefaults;
  /** Notes internes : seulement avec la lecture clinique. */
  showNotes: boolean;
}) {
  const t = useAppText();
  const text = t.patients.form;
  const [state, action, pending] = useActionState(
    animalId ? updateAnimalAction : createAnimalAction,
    initialState,
  );
  // Après un refus, la saisie revient telle quelle : le formulaire est réinitialisé sur elle.
  const values = state.values ?? defaults;
  const [primary = EMPTY_OWNER, second] = values?.owners ?? [];
  const [hasSecond, setHasSecond] = useState(Boolean(second));
  const fields = state.fields ?? {};
  const errors = (name: string) => {
    const message = fields[name];
    return message ? [message] : undefined;
  };
  const notesId = useId();

  return (
    <form action={action} className="grid gap-6" noValidate>
      {animalId ? (
        <input type="hidden" name="animalId" value={animalId} />
      ) : null}
      {hasSecond ? <input type="hidden" name="secondOwner" value="on" /> : null}

      <Card className="grid gap-4 p-5 sm:p-6">
        <h2 className="text-base font-bold tracking-tight">{text.animal}</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <TextField
            label={text.name}
            name="name"
            defaultValue={values?.name}
            autoComplete="off"
            required
            maxLength={80}
            errors={errors("name")}
          />
          <Select
            label={text.species}
            name="species"
            defaultValue={values?.species ?? "dog"}
            options={[
              { value: "dog", label: t.labels.species.dog },
              { value: "cat", label: t.labels.species.cat },
            ]}
          />
          <TextField
            label={text.breed}
            name="breed"
            defaultValue={values?.breed}
            autoComplete="off"
            maxLength={80}
            hint={text.breedHint}
            errors={errors("breed")}
          />
          <Select
            label={text.sex}
            name="sex"
            defaultValue={values?.sex ?? ""}
            options={[
              { value: "", label: text.unknown },
              { value: "female", label: t.patients.sex.female },
              { value: "male", label: t.patients.sex.male },
            ]}
          />
          <Select
            label={text.neutered}
            name="neutered"
            defaultValue={values?.neutered ?? ""}
            options={[
              { value: "", label: text.unknown },
              { value: "yes", label: t.patients.neutered.yes },
              { value: "no", label: t.patients.neutered.no },
            ]}
          />
          <div className="grid grid-cols-2 gap-4">
            <TextField
              label={text.birthDate}
              name="birthDate"
              type="date"
              defaultValue={values?.birthDate}
              errors={errors("birthDate")}
            />
            <TextField
              label={text.weight}
              name="weightKg"
              inputMode="decimal"
              defaultValue={values?.weightKg}
              autoComplete="off"
              maxLength={6}
              errors={errors("weightKg")}
            />
          </div>
        </div>
        {showNotes ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={notesId} className="text-sm font-semibold">
              {text.notes}
            </label>
            <textarea
              id={notesId}
              name="notes"
              rows={3}
              maxLength={2000}
              defaultValue={values?.notes}
              aria-describedby={`${notesId}-aide`}
              aria-invalid={fields.notes ? true : undefined}
              className="rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2 text-[15px] text-ink focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
            />
            <p id={`${notesId}-aide`} className="text-[13px] text-ink-muted">
              {text.notesHint}
            </p>
            {fields.notes ? (
              <p className="text-[13px] font-medium text-urgent">
                {fields.notes}
              </p>
            ) : null}
          </div>
        ) : null}
      </Card>

      <Card className="grid gap-4 p-5 sm:p-6">
        <div>
          <h2 className="text-base font-bold tracking-tight">{text.owner}</h2>
          <p className="mt-0.5 text-sm text-ink-muted">
            {animalId ? text.phoneChangeNote : text.reuseNote}
          </p>
        </div>
        <OwnerFields index={0} owner={primary} fields={fields} />
        {hasSecond ? (
          <div className="grid gap-4 border-t border-line pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold">{text.secondOwner}</h3>
              <Button
                variant="quiet"
                size="sm"
                onClick={() => setHasSecond(false)}
              >
                {text.removeSecondOwner}
              </Button>
            </div>
            <OwnerFields
              index={1}
              owner={second ?? EMPTY_OWNER}
              fields={fields}
            />
          </div>
        ) : (
          <div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setHasSecond(true)}
            >
              {text.addSecondOwner}
            </Button>
          </div>
        )}
      </Card>

      <ActionMessage state={{ error: state.error }} />
      <div>
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {animalId ? text.submitEdit : text.submitCreate}
        </Button>
      </div>
    </form>
  );
}
