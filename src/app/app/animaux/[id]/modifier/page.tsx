import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DomainError } from "@/domains/equipe/actor";
import { appText } from "@/i18n/app/server";
import { requirePermission } from "@/server/authz";
import { services } from "@/server/services";
import { PageHeader } from "@/ui/page-header";

import { PatientForm } from "../../patient-form";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await appText();
  return { title: t.patients.title };
}

export default async function EditAnimalPage({
  params,
}: PageProps<"/app/animaux/[id]/modifier">) {
  const context = await requirePermission("followups.launch");
  const { id } = await params;
  const record = await services
    .patients()
    .get(context, id)
    .catch((error: unknown) => {
      if (error instanceof DomainError && error.code === "not_found")
        notFound();
      throw error;
    });
  // Une fiche archivée se restaure avant d'être modifiée.
  if (record.archivedAt) notFound();
  const { t } = await appText();
  const text = t.patients.form;
  return (
    <>
      <Link
        href={`/app/animaux/${record.id}`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {text.backTo(record.name)}
      </Link>
      <PageHeader title={text.editTitle(record.name)} />
      <PatientForm
        animalId={record.id}
        showNotes={context.permissions.has("clinical.read")}
        defaults={{
          name: record.name,
          species: record.species,
          breed: record.breed ?? "",
          sex: record.sex ?? "",
          neutered:
            record.neutered === null ? "" : record.neutered ? "yes" : "no",
          birthDate: record.birthDate ?? "",
          weightKg:
            record.weightGrams === null
              ? ""
              : String(record.weightGrams / 1000),
          notes: record.notes ?? "",
          owners: record.owners.map((owner) => ({
            id: owner.id,
            fullName: owner.fullName,
            phone: owner.phone ?? "",
            email: owner.email ?? "",
            language: owner.language,
          })),
        }}
      />
    </>
  );
}
