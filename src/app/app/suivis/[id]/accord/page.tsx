import { ArrowLeft, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { DomainError } from "@/domains/commun/actor";
import { configuredWhatsApp } from "@/domains/whatsapp/connexion";
import { appText } from "@/i18n/app/server";
import { requirePermission } from "@/server/authz";
import { services } from "@/server/services";

import { OptInBoard } from "./opt-in-board";

// Titre générique : le nom de l'animal n'apparaît qu'après contrôle d'accès, dans la page.
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await appText();
  return { title: t.followups.optInQr.title };
}

/** Écran de l'accueil (ADR 0051), tourné vers le propriétaire : ce qu'il accepte, puis son QR code. */
export default async function OptInQrPage({
  params,
}: PageProps<"/app/suivis/[id]/accord">) {
  const context = await requirePermission("followups.launch");
  const { id } = await params;
  let view: Awaited<ReturnType<ReturnType<typeof services.optIn>["status"]>>;
  try {
    view = await services.optIn().status(context, id);
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    // Déjà lancé ou suivi test : l'accord n'est plus à recueillir ici.
    if (error.code === "invalid_transition") redirect(`/app/suivis/${id}`);
    // Inexistant, autre cabinet ou non autorisé : même réponse 404.
    notFound();
  }
  const { t } = await appText();
  const text = t.followups.optInQr;

  return (
    <>
      <Link
        href={`/app/suivis/${id}/lancement`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {text.back(view.animalName)}
      </Link>
      <header className="mb-6 max-w-3xl">
        <h1 className="font-display text-[1.75rem] leading-tight font-semibold tracking-tight sm:text-[2rem]">
          {text.heading(view.animalName)}
        </h1>
        <p className="mt-2 text-ink-muted">{text.intro}</p>
      </header>

      <section
        aria-labelledby="ce-que-vous-acceptez"
        className="mb-6 max-w-3xl rounded-[var(--radius-card)] border border-brand/20 bg-brand-soft/50 p-5"
      >
        <h2
          id="ce-que-vous-acceptez"
          className="flex items-center gap-2 font-bold tracking-tight text-brand-ink"
        >
          <ShieldCheck aria-hidden="true" className="size-5" />
          {text.consentTitle}
        </h2>
        <p className="mt-2 text-sm leading-relaxed">
          {text.consent(view.practiceName, view.animalName)}
        </p>
        {view.contacts.length > 1 ? (
          <p className="mt-2 text-sm text-ink-muted">{text.twoOwners}</p>
        ) : null}
      </section>

      <OptInBoard
        followupId={id}
        contacts={view.contacts}
        simulated={configuredWhatsApp().mode !== "cloud_api"}
      />
    </>
  );
}
