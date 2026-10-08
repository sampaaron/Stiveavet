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
import { appText } from "@/i18n/app/server";
import type { AppDictionary } from "@/i18n/app/types";
import type { Locale } from "@/i18n/locales";
import { memberContext } from "@/server/authz";
import type { MemberContext } from "@/server/authz";
import { serverEnv } from "@/server/env";
import { services } from "@/server/services";
import { AlertBanner } from "@/ui/alert-banner";
import { cn } from "@/ui/cn";
import { formatDateTime } from "@/ui/format";

import { messageText } from "../live-conversation";

import {
  OwnerPhotoForm,
  OwnerSimulatorForm,
  OwnerVoiceForm,
  RunDueNowForm,
} from "./simulator-forms";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await appText();
  return { title: t.dossier.simulator.title };
}

type Done = keyof AppDictionary["dossier"]["simulator"]["done"];

function doneKey(value: unknown, t: AppDictionary): Done | undefined {
  return typeof value === "string" &&
    Object.hasOwn(t.dossier.simulator.done, value)
    ? (value as Done)
    : undefined;
}

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
  const { fait, contact } = await searchParams;
  const { t, locale } = await appText();
  const text = t.dossier.simulator;
  const doneCode = doneKey(fait, t);
  const done = doneCode ? text.done[doneCode] : undefined;
  // Le propriétaire joué : le principal, ou le second contact s'il participe (lot 18).
  const persona =
    view.contacts.find(
      (item) =>
        item.role === (contact === "secondary" ? "secondary" : "primary"),
    ) ?? view.contacts[0];
  const role = persona?.role ?? "primary";
  const ownerFirstName =
    persona?.firstName ?? view.ownerFirstName ?? t.ui.chat.owner;
  const others = view.contacts.filter((item) => item.role !== role);
  // Ce que ce propriétaire voit : ses échanges directs avec le cabinet et le groupe tant qu'il
  // en est membre ; les messages envoyés seulement, jamais ceux en attente ou bloqués.
  const visible = view.messages.filter((message) => {
    const sent =
      message.author === "owner" ||
      message.delivery === "sent" ||
      message.delivery === "delivered" ||
      message.delivery === "read";
    if (!sent) return false;
    if (message.channel === "direct") return message.contactRole === role;
    const leftAt = persona?.leftGroupAt;
    return !leftAt || message.occurredAt.getTime() < leftAt.getTime();
  });

  return (
    <>
      <Link
        href={`/app/suivis/${view.followupId}#conversation`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {text.back(view.animalName)}
      </Link>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{text.title}</h1>
        <p className="mt-1 flex items-start gap-2 text-ink-muted">
          <FlaskConical aria-hidden="true" className="mt-1 size-4 shrink-0" />
          <span>{text.intro(ownerFirstName)}</span>
        </p>
      </header>

      {others.length ? (
        <nav
          aria-label={text.personaNav}
          className="mb-4 flex flex-wrap items-center gap-2 text-sm"
        >
          <span className="text-ink-muted">{text.playing}</span>
          {view.contacts.map((item) =>
            item.role === role ? (
              <span
                key={item.role}
                aria-current="true"
                className="rounded-full bg-brand px-3 py-1 font-semibold text-white"
              >
                {item.firstName}
              </span>
            ) : (
              <Link
                key={item.role}
                href={`/app/suivis/${view.followupId}/simulateur${item.role === "secondary" ? "?contact=secondary" : ""}`}
                className="rounded-full border border-line px-3 py-1 font-semibold hover:bg-canvas-subtle"
              >
                {text.play(item.firstName)}
              </Link>
            ),
          )}
        </nav>
      ) : null}

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
          aria-label={text.phoneLabel(ownerFirstName)}
          className="flex min-w-0 flex-col overflow-hidden rounded-[1.75rem] border border-line bg-surface shadow-[var(--shadow-card)]"
        >
          <div className="border-b border-line bg-brand px-4 py-3 text-white">
            <p className="font-semibold">{text.practice}</p>
            <p className="text-xs opacity-90">{text.business}</p>
          </div>
          <ol
            aria-label={text.messagesLabel}
            className="flex min-h-64 flex-col gap-3 bg-canvas px-3 py-4"
          >
            {visible.length ? (
              visible.map((message) => (
                <li key={message.id}>
                  <PhoneBubble
                    t={t}
                    locale={locale}
                    message={message}
                    links={links}
                    role={role}
                  />
                </li>
              ))
            ) : (
              <li className="self-center py-8 text-center text-sm text-ink-muted">
                {text.noMessages}
              </li>
            )}
          </ol>
          <div className="border-t border-line p-3">
            <OwnerSimulatorForm
              followupId={view.followupId}
              ownerFirstName={ownerFirstName}
              from={role}
            />
          </div>
        </section>

        <div className="flex min-w-0 flex-col gap-4">
          <AlertBanner tone="info" title={text.howTitle}>
            {text.how}
          </AlertBanner>
          <RunDueNowForm followupId={view.followupId} />
          <section
            aria-label={text.mediaSection}
            className="grid gap-5 rounded-[var(--radius-card)] border border-line bg-surface p-4"
          >
            <OwnerPhotoForm
              followupId={view.followupId}
              ownerFirstName={ownerFirstName}
              from={role}
            />
            <OwnerVoiceForm
              followupId={view.followupId}
              ownerFirstName={ownerFirstName}
              from={role}
            />
          </section>
        </div>
      </div>
    </>
  );
}

function PhoneBubble({
  t,
  locale,
  message,
  links,
  role,
}: {
  t: AppDictionary;
  locale: Locale;
  message: ConversationMessage;
  links: Record<string, SignedLink>;
  role: "primary" | "secondary";
}) {
  const mine = message.author === "owner" && message.contactRole === role;
  const text = t.dossier.simulator;
  const body = messageText(t, message);
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3 py-2 text-[15px] shadow-sm",
          mine ? "rounded-br-md bg-brand-soft" : "rounded-bl-md bg-surface",
        )}
      >
        {message.channel === "group" ? (
          <p className="mb-0.5 text-[11px] font-semibold tracking-wide text-brand-ink uppercase">
            {text.group}
          </p>
        ) : null}
        {mine ? null : (
          <p className="mb-0.5 text-xs font-semibold text-ink-muted">
            {message.author === "numa"
              ? t.ui.chat.numaAuthor
              : message.author === "owner"
                ? (message.contactName ?? t.ui.chat.owner)
                : (message.authorName ?? text.practiceFallback)}
          </p>
        )}
        {message.attachment?.kind === "photo" &&
        links[message.attachment.id] ? (
          // Lien signé de deux minutes, servi par l'application.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={links[message.attachment.id]?.url}
            alt={text.photoAlt}
            className="mb-1 max-h-56 w-auto max-w-full rounded-xl"
          />
        ) : null}
        {message.attachment?.kind === "voice" ? (
          <p className="flex items-center gap-2 font-medium">
            <Mic aria-hidden="true" className="size-4" />
            {t.ui.chat.voice(
              message.attachment.durationMs === null
                ? t.dossier.conversation.durationUnknown
                : durationLabel(message.attachment.durationMs),
            )}
          </p>
        ) : null}
        {body ? <p className="whitespace-pre-line">{body}</p> : null}
        <p className="mt-1 text-right text-xs text-ink-muted">
          {formatDateTime(message.occurredAt, locale)}
        </p>
      </div>
    </div>
  );
}
