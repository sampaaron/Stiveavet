import { ArrowLeft, FlaskConical, Mic } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import type {
  ConversationMessage,
  ConversationView,
} from "@/domains/conversations/service";
import { DomainError } from "@/domains/equipe/actor";
import type { SignedLink } from "@/domains/fichiers/liens";
import { durationLabel } from "@/domains/fichiers/media";
import { memberContext } from "@/server/authz";
import type { MemberContext } from "@/server/authz";
import { serverEnv } from "@/server/env";
import { services } from "@/server/services";
import { AlertBanner } from "@/ui/alert-banner";
import { cn } from "@/ui/cn";
import { formatDateTime } from "@/ui/format";

import {
  OwnerPhotoForm,
  OwnerSimulatorForm,
  OwnerVoiceForm,
  RunDueNowForm,
} from "./simulator-forms";

export const metadata: Metadata = { title: "Simulateur du propriétaire" };

const DONE: Record<string, string> = {
  envoye: "Message du propriétaire reçu par Stivea Vet.",
  avance: "Prochain envoi prévu exécuté.",
  photo: "Photo du propriétaire reçue par Stivea Vet.",
  vocal: "Message vocal du propriétaire reçu et transcrit (simulation).",
};

async function loadView(
  context: MemberContext,
  id: string,
): Promise<ConversationView> {
  try {
    return await services.conversations().view(context, id);
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }
}

/**
 * Simulateur du propriétaire (lot 13) : en local seulement, un membre avec l'accès clinique
 * joue le propriétaire et voit ce que son WhatsApp recevrait. Rien ne sort de la machine.
 */
export default async function OwnerSimulatorPage({
  params,
  searchParams,
}: PageProps<"/app/suivis/[id]/simulateur">) {
  if (serverEnv().APP_ENV !== "local") notFound();
  const context = await memberContext();
  const { id } = await params;
  const view = await loadView(context, id);
  if (view.status === "draft" || view.isTest) notFound();
  const links = await services.media().readLinks(context, id);
  const { fait } = await searchParams;
  const done = typeof fait === "string" ? DONE[fait] : undefined;
  const ownerFirstName = view.ownerFirstName ?? "Propriétaire";
  // Ce que le propriétaire voit : les messages envoyés, jamais ceux en attente ou bloqués.
  const visible = view.messages.filter(
    (message) =>
      message.author === "owner" ||
      message.delivery === "sent" ||
      message.delivery === "delivered" ||
      message.delivery === "read",
  );

  return (
    <>
      <Link
        href={`/app/suivis/${view.followupId}#conversation`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Dossier de {view.animalName}
      </Link>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">
          Simulateur du propriétaire
        </h1>
        <p className="mt-1 flex items-start gap-2 text-ink-muted">
          <FlaskConical aria-hidden="true" className="mt-1 size-4 shrink-0" />
          <span>
            Environnement local uniquement. Vous jouez {ownerFirstName} : vos
            messages arrivent dans Stivea Vet comme s&apos;ils venaient de
            WhatsApp. Rien n&apos;est envoyé à un vrai numéro.
          </span>
        </p>
      </header>

      {done ? (
        <p
          role="status"
          className="mb-4 rounded-[var(--radius-card)] bg-brand-soft px-4 py-3 text-sm font-medium text-brand-ink"
        >
          {done}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <section
          aria-label={`WhatsApp de ${ownerFirstName} (simulé)`}
          className="flex min-w-0 flex-col overflow-hidden rounded-[1.75rem] border border-line bg-surface shadow-[var(--shadow-card)]"
        >
          <div className="border-b border-line bg-brand px-4 py-3 text-white">
            <p className="font-semibold">Cabinet vétérinaire</p>
            <p className="text-xs opacity-90">WhatsApp Business (simulé)</p>
          </div>
          <ol
            aria-label="Messages reçus et envoyés"
            className="flex min-h-64 flex-col gap-3 bg-canvas px-3 py-4"
          >
            {visible.length ? (
              visible.map((message) => (
                <li key={message.id}>
                  <PhoneBubble message={message} links={links} />
                </li>
              ))
            ) : (
              <li className="self-center py-8 text-center text-sm text-ink-muted">
                Aucun message reçu pour l&apos;instant.
              </li>
            )}
          </ol>
          <div className="border-t border-line p-3">
            <OwnerSimulatorForm
              followupId={view.followupId}
              ownerFirstName={ownerFirstName}
            />
          </div>
        </section>

        <div className="flex min-w-0 flex-col gap-4">
          <AlertBanner tone="info" title="Comment l'utiliser">
            Le premier message de Numa part à l&apos;heure choisie sur la fiche
            de lancement. Pour ne pas attendre, avancez jusqu&apos;au prochain
            envoi prévu : premier message, rappel du programme, puis fin du
            suivi à la date de contrôle. Répondez OUI pour donner l&apos;accord,
            STOP pour le retirer, REPRENDRE pour le redonner.
          </AlertBanner>
          <RunDueNowForm followupId={view.followupId} />
          <section
            aria-label="Photo ou message vocal"
            className="grid gap-5 rounded-[var(--radius-card)] border border-line bg-surface p-4"
          >
            <OwnerPhotoForm
              followupId={view.followupId}
              ownerFirstName={ownerFirstName}
            />
            <OwnerVoiceForm
              followupId={view.followupId}
              ownerFirstName={ownerFirstName}
            />
          </section>
        </div>
      </div>
    </>
  );
}

function PhoneBubble({
  message,
  links,
}: {
  message: ConversationMessage;
  links: Record<string, SignedLink>;
}) {
  const mine = message.author === "owner";
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3 py-2 text-[15px] shadow-sm",
          mine ? "rounded-br-md bg-brand-soft" : "rounded-bl-md bg-surface",
        )}
      >
        {mine ? null : (
          <p className="mb-0.5 text-xs font-semibold text-ink-muted">
            {message.author === "numa"
              ? "Numa · assistante IA"
              : (message.authorName ?? "Cabinet")}
          </p>
        )}
        {message.attachment?.kind === "photo" &&
        links[message.attachment.id] ? (
          // Lien signé de deux minutes, servi par l'application.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={links[message.attachment.id]?.url}
            alt="Photo envoyée"
            className="mb-1 max-h-56 w-auto max-w-full rounded-xl"
          />
        ) : null}
        {message.attachment?.kind === "voice" ? (
          <p className="flex items-center gap-2 font-medium">
            <Mic aria-hidden="true" className="size-4" />
            Message vocal · {durationLabel(message.attachment.durationMs)}
          </p>
        ) : null}
        {message.body ? (
          <p className="whitespace-pre-line">{message.body}</p>
        ) : null}
        <p className="mt-1 text-right text-xs text-ink-muted">
          {formatDateTime(message.occurredAt)}
        </p>
      </div>
    </div>
  );
}
