"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { DomainError } from "@/domains/equipe/actor";
import { MAX_OWNERS, patientInput } from "@/domains/patients/content";
import { parisLocalToDate } from "@/domains/heure-paris";
import { appText } from "@/i18n/app/server";
import type { AppDictionary } from "@/i18n/app/types";
import { memberContext } from "@/server/authz";
import { services } from "@/server/services";

import type { ActionState } from "../action-state";
import { domainFailure, invalidRequest } from "../domain-messages";
import { text } from "../form-data";

/**
 * Registre des animaux (ADR 0030). Chaque action refait la garde (session, membre actif,
 * permissions relues en base) ; le service revalide tout et vérifie le cabinet.
 */

export type OwnerDefaults = {
  id: string | null;
  fullName: string;
  phone: string;
  email: string;
  language: "fr" | "en";
};

export type PatientDefaults = {
  name: string;
  species: "dog" | "cat";
  breed: string;
  sex: "" | "female" | "male";
  neutered: "" | "yes" | "no";
  birthDate: string;
  weightKg: string;
  notes: string;
  owners: OwnerDefaults[];
};

export type PatientFormState = ActionState & {
  /** Message par champ (`name`, `owner0.phone`…), dans la langue de la personne. */
  fields?: Record<string, string>;
  /** Saisie refusée, réaffichée telle quelle. */
  values?: PatientDefaults;
  /** Idem pour le formulaire de lancement. */
  entered?: Record<string, string>;
};

const idInput = z.uuid();

/** Saisie brute du formulaire, dans la forme attendue par `patientInput`. */
function readPatient(form: FormData) {
  const count = text(form, "secondOwner") === "on" ? MAX_OWNERS : 1;
  return {
    animal: {
      name: text(form, "name"),
      species: text(form, "species"),
      breed: text(form, "breed"),
      sex: text(form, "sex"),
      neutered: text(form, "neutered"),
      birthDate: text(form, "birthDate"),
      weightKg: text(form, "weightKg"),
      notes: text(form, "notes"),
    },
    owners: Array.from({ length: count }, (_, index) => ({
      id: text(form, `owner${index}.id`) || null,
      fullName: text(form, `owner${index}.fullName`),
      phone: text(form, `owner${index}.phone`),
      email: text(form, `owner${index}.email`),
      language: text(form, `owner${index}.language`),
    })),
  };
}

const ANIMAL_MESSAGES: Record<
  string,
  keyof AppDictionary["patients"]["validation"]
> = {
  name: "name",
  breed: "breed",
  birthDate: "birthDate",
  weightKg: "weight",
  notes: "notes",
};
const OWNER_MESSAGES: Record<
  string,
  keyof AppDictionary["patients"]["validation"]
> = {
  fullName: "ownerName",
  phone: "phone",
  email: "email",
};

/** Erreurs par champ ; null si la saisie est valide. */
async function fieldErrors(
  raw: ReturnType<typeof readPatient>,
): Promise<Record<string, string> | null> {
  const { t } = await appText();
  const v = t.patients.validation;
  const fields: Record<string, string> = {};
  const parsed = patientInput().safeParse(raw);
  if (!parsed.success)
    for (const issue of parsed.error.issues) {
      const [group, index, leaf] = issue.path;
      if (group === "animal" && typeof index === "string") {
        const key = ANIMAL_MESSAGES[index];
        if (key) fields[index] ??= v[key];
      } else if (
        group === "owners" &&
        typeof index === "number" &&
        typeof leaf === "string"
      ) {
        const key = OWNER_MESSAGES[leaf];
        if (key) fields[`owner${index}.${leaf}`] ??= v[key];
      }
    }
  else {
    const [first, second] = parsed.data.owners;
    if (first && second && first.phone === second.phone)
      fields["owner1.phone"] = v.samePhone;
  }
  // Champ refusé sans message prévu (liste trafiquée) : message générique.
  if (!parsed.success && !Object.keys(fields).length)
    fields.form = t.common.invalidRequest;
  return Object.keys(fields).length ? fields : null;
}

/** Saisie réaffichée après un refus ; une valeur hors liste reprend la valeur par défaut. */
function echo(raw: ReturnType<typeof readPatient>): PatientDefaults {
  const pick = <T extends string>(
    value: string,
    allowed: readonly T[],
    fallback: T,
  ) =>
    (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
  return {
    name: raw.animal.name,
    species: pick(raw.animal.species, ["dog", "cat"], "dog"),
    breed: raw.animal.breed,
    sex: pick(raw.animal.sex, ["", "female", "male"], ""),
    neutered: pick(raw.animal.neutered, ["", "yes", "no"], ""),
    birthDate: raw.animal.birthDate,
    weightKg: raw.animal.weightKg,
    notes: raw.animal.notes,
    owners: raw.owners.map((owner) => ({
      id: owner.id && idInput.safeParse(owner.id).success ? owner.id : null,
      fullName: owner.fullName,
      phone: owner.phone,
      email: owner.email,
      language: pick(owner.language, ["fr", "en"], "fr"),
    })),
  };
}

async function failure(error: unknown): Promise<PatientFormState> {
  if (error instanceof DomainError) return domainFailure(error);
  throw error;
}

export async function createAnimalAction(
  _previous: PatientFormState,
  form: FormData,
): Promise<PatientFormState> {
  const raw = readPatient(form);
  const fields = await fieldErrors(raw);
  if (fields) return { fields, error: fields.form, values: echo(raw) };
  const context = await memberContext();
  let animalId = "";
  try {
    animalId = await services.patients().create(context, raw);
  } catch (error) {
    return { ...(await failure(error)), values: echo(raw) };
  }
  revalidatePath("/app/animaux");
  redirect(`/app/animaux/${animalId}`);
}

export async function updateAnimalAction(
  _previous: PatientFormState,
  form: FormData,
): Promise<PatientFormState> {
  const animalId = idInput.safeParse(text(form, "animalId"));
  if (!animalId.success) return invalidRequest();
  const raw = readPatient(form);
  const fields = await fieldErrors(raw);
  if (fields) return { fields, error: fields.form, values: echo(raw) };
  const context = await memberContext();
  try {
    await services.patients().update(context, animalId.data, raw);
  } catch (error) {
    return { ...(await failure(error)), values: echo(raw) };
  }
  revalidatePath("/app/animaux");
  redirect(`/app/animaux/${animalId.data}`);
}

/** Archiver, restaurer ou supprimer une fiche. */
export async function animalStatusAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      animalId: z.uuid(),
      change: z.enum(["archive", "restore", "delete"]),
    })
    .safeParse({
      animalId: text(form, "animalId"),
      change: text(form, "change"),
    });
  if (!parsed.success) return invalidRequest();
  const { animalId, change } = parsed.data;
  const context = await memberContext();
  const patients = services.patients();
  try {
    if (change === "delete") await patients.remove(context, animalId);
    else await patients.setArchived(context, animalId, change === "archive");
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/app/animaux");
  if (change === "delete") redirect("/app/animaux");
  const { t } = await appText();
  revalidatePath(`/app/animaux/${animalId}`);
  return {
    notice:
      change === "archive"
        ? t.patients.record.archived
        : t.patients.record.restored,
  };
}

/** Prépare le brouillon de suivi depuis la fiche, puis ouvre la fiche de lancement. */
export async function launchFromAnimalAction(
  _previous: PatientFormState,
  form: FormData,
): Promise<PatientFormState> {
  const { t } = await appText();
  const v = t.patients.validation;
  const animalId = idInput.safeParse(text(form, "animalId"));
  const protocolId = text(form, "protocolId");
  if (
    !animalId.success ||
    (protocolId && !idInput.safeParse(protocolId).success)
  )
    return invalidRequest();
  const procedure = text(form, "procedure").trim();
  const procedureAt = parisLocalToDate(text(form, "procedureAt"));
  const controlRaw = text(form, "controlAppointmentAt");
  const control = controlRaw ? parisLocalToDate(controlRaw) : null;

  const fields: Record<string, string> = {};
  if (procedure.length < 3 || procedure.length > 160)
    fields.procedure = v.procedure;
  if (!procedureAt) fields.procedureAt = v.procedureAt;
  if (
    controlRaw &&
    (!control || (procedureAt && control.getTime() <= procedureAt.getTime()))
  )
    fields.controlAppointmentAt = v.control;
  const entered = {
    procedure,
    procedureAt: text(form, "procedureAt"),
    controlAppointmentAt: controlRaw,
    protocolId,
  };
  if (Object.keys(fields).length || !procedureAt) return { fields, entered };

  const context = await memberContext();
  let followupId = "";
  try {
    followupId = await services
      .launch()
      .prepareFromAnimal(context, animalId.data, {
        procedure,
        procedureAt,
        controlAppointmentAt: control,
        protocolId: protocolId || null,
      });
  } catch (error) {
    return { ...(await failure(error)), entered };
  }
  revalidatePath("/app/suivis");
  revalidatePath(`/app/animaux/${animalId.data}`);
  redirect(`/app/suivis/${followupId}/lancement`);
}
