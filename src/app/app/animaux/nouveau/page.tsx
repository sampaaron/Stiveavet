import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { appText } from "@/i18n/app/server";
import { requirePermission } from "@/server/authz";
import { PageHeader } from "@/ui/page-header";

import { PatientForm } from "../patient-form";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await appText();
  return { title: t.patients.form.createTitle };
}

export default async function NewAnimalPage() {
  const context = await requirePermission("followups.launch");
  const { t } = await appText();
  const text = t.patients.form;
  return (
    <>
      <Link
        href="/app/animaux"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {text.back}
      </Link>
      <PageHeader
        title={text.createTitle}
        description={text.createDescription}
      />
      <PatientForm showNotes={context.permissions.has("clinical.read")} />
    </>
  );
}
