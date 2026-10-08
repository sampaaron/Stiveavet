import { FlaskConical, ShieldCheck } from "lucide-react";
import Link from "next/link";

import type {
  ConversationMessage,
  ConversationView,
  MessageAttachment,
} from "@/domains/conversations/service";
import type { SignedLink } from "@/domains/fichiers/liens";
import { durationLabel } from "@/domains/fichiers/media";
import type { Attachment, Message } from "@/fixtures/types";
import type { AppDictionary } from "@/i18n/app/types";
import type { Locale } from "@/i18n/locales";
import { Card } from "@/ui/card";
import { ChatThread } from "@/ui/chat";
import { formatDate, formatTime } from "@/ui/format";
import { EmptyState } from "@/ui/states";

import { OwnerComposer, ResumeNumaButton } from "./conversation-controls";

type Text = AppDictionary["dossier"]["conversation"];

/** Durée d'un vocal, « durée inconnue » dans la langue du lecteur. */
function voiceDuration(text: Text, ms: number | null): string {
  return ms === null ? text.durationUnknown : durationLabel(ms);
}

function toAttachment(
  text: Text,
  attachment: MessageAttachment,
  links: Record<string, SignedLink>,
): Attachment {
  if (attachment.deleted)
    return {
      kind: "deleted",
      label:
        attachment.kind === "photo" ? text.deletedPhoto : text.deletedVoice,
    };
  const src = links[attachment.id]?.url;
  return attachment.kind === "photo"
    ? {
        kind: "photo",
        label: text.photo,
        src,
        observations: attachment.observations,
      }
    : {
        kind: "voice",
        durationLabel: voiceDuration(text, attachment.durationMs),
        transcript: attachment.transcript,
        src,
      };
}

/** Avec deux propriétaires : dans le groupe, ou à qui le message a été écrit en direct. */
function channelNote(
  text: Text,
  message: ConversationMessage,
  twoOwners: boolean,
): string | undefined {
  if (!twoOwners) return undefined;
  if (message.channel === "group") return text.inGroup;
  if (message.author !== "owner" && message.contactName)
    return text.to(message.contactName);
  return undefined;
}

/** Trace du groupe dans la langue du lecteur ; à défaut, le texte enregistré. */
function messageText(
  t: AppDictionary,
  message: ConversationMessage,
): string {
  const note = message.note;
  if (!note) return message.body;
  const notes = t.dossier.conversation.notes;
  return note.code === "group_created"
    ? notes.group_created(t.common.list(note.names))
    : notes[note.code](note.names[0] ?? "");
}

function deliveryNote(
  text: Text,
  delivery: ConversationMessage["delivery"],
): string | undefined {
  return delivery === "queued" || delivery === "failed"
    ? text.delivery[delivery]
    : undefined;
}

function toBubble(
  t: AppDictionary,
  locale: Locale,
  message: ConversationMessage,
  links: Record<string, SignedLink>,
  ownerFirstName: string | null,
  twoOwners: boolean,
): Message {
  const text = t.dossier.conversation;
  const notes = [
    channelNote(text, message, twoOwners),
    deliveryNote(text, message.delivery),
  ].filter(Boolean);
  return {
    id: message.id,
    author: message.author,
    authorName:
      (message.author === "owner"
        ? (message.contactName ?? ownerFirstName)
        : message.authorName) ?? undefined,
    at: [formatTime(message.occurredAt, locale), ...notes].join(" · "),
    dayLabel: formatDate(message.occurredAt, locale),
    text: messageText(t, message),
    triage: message.triage ?? undefined,
    attachment: message.attachment
      ? toAttachment(text, message.attachment, links)
      : undefined,
  };
}

/** Avec deux propriétaires : l'état de chacun et du groupe, en une ligne. */
function contactsLine(text: Text, view: ConversationView): string | null {
  if (view.contacts.length < 2) return null;
  const people = view.contacts.map((contact) => {
    const state = contact.stopRequested
      ? text.stopRequested
      : contact.leftGroup
        ? text.leftGroup
        : contact.consent
          ? text.consent[contact.consent]
          : text.notContacted;
    return text.contactState(contact.firstName, state);
  });
  const group = view.group ? text.groupOpen : text.groupLater;
  return [...people, group].join(" · ");
}

/** État de la conversation, en une phrase : accord du propriétaire d'abord, puis le suivi. */
function stateLabel(text: Text, view: ConversationView): string {
  if (view.stoppedByOwner) return text.states.stoppedByOwner;
  if (view.contacts.length > 1 && view.recipients)
    return followupLabel(text, view);
  if (view.consent === null) return text.states.notStarted;
  if (view.consent === "requested") return text.states.consentRequested;
  if (view.consent === "withdrawn") return text.states.consentWithdrawn;
  return followupLabel(text, view);
}

function followupLabel(text: Text, view: ConversationView): string {
  switch (view.status) {
    case "human_takeover":
      return text.states.takeover;
    case "paused":
      return text.states.paused;
    case "ended":
      return view.endedAutomatically
        ? text.states.endedAutomatically
        : text.states.ended;
    default:
      return text.states.active;
  }
}

/** Conversation WhatsApp réelle d'un suivi lancé (données en base). */
export function LiveConversation({
  t,
  locale,
  view,
  links,
  simulatorHref,
}: {
  t: AppDictionary;
  locale: Locale;
  view: ConversationView;
  /** Liens de lecture signés des photos et vocaux, pour la personne qui consulte. */
  links: Record<string, SignedLink>;
  /** Lien vers le simulateur du propriétaire, en local seulement. */
  simulatorHref: string | null;
}) {
  // Écrire n'est possible que vers un propriétaire qui a donné son accord.
  const canCompose =
    view.rights.canWrite && view.recipients !== null && !view.isTest;
  const text = t.dossier.conversation;
  const ownerFirstName = view.ownerFirstName ?? t.ui.chat.theOwner;
  const twoOwners = view.contacts.length > 1;
  const contacts = contactsLine(text, view);

  return (
    <Card className="flex flex-col" id="conversation">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h2 className="font-bold">{text.title}</h2>
          <p className="text-sm text-ink-muted">{stateLabel(text, view)}</p>
          {contacts ? (
            <p className="mt-0.5 text-sm text-ink-muted">{contacts}</p>
          ) : null}
        </div>
        {view.rights.canResume && view.status === "human_takeover" ? (
          <ResumeNumaButton followupId={view.followupId} />
        ) : null}
      </div>

      <div className="flex items-start gap-2 border-b border-line bg-canvas px-5 py-3 text-sm text-ink-muted">
        <ShieldCheck
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-brand"
        />
        <p>{text.aiNotice}</p>
      </div>

      <div className="px-4 py-5 sm:px-5">
        {view.messages.length > 0 ? (
          <ChatThread
            messages={view.messages.map((message) =>
              toBubble(
                t,
                locale,
                message,
                links,
                view.ownerFirstName,
                twoOwners,
              ),
            )}
          />
        ) : (
          <EmptyState
            title={text.emptyTitle}
            description={
              view.isTest
                ? text.emptyTest
                : text.emptyScheduled(ownerFirstName)
            }
          />
        )}
      </div>

      {canCompose ? (
        <OwnerComposer
          followupId={view.followupId}
          recipients={
            view.recipients ? t.common.list(view.recipients) : ownerFirstName
          }
          animalName={view.animalName}
          pausesNuma={view.status === "active"}
        />
      ) : (
        <p className="border-t border-line p-4 text-sm text-ink-muted sm:p-5">
          {!view.rights.canWrite ? text.readOnly : text.afterConsent}
        </p>
      )}

      {simulatorHref ? (
        <p className="flex items-center gap-2 border-t border-dashed border-line px-5 py-3 text-xs text-ink-muted">
          <FlaskConical aria-hidden="true" className="size-4 shrink-0" />
          <span>
            {text.localEnvironment}{" "}
            <Link
              href={simulatorHref}
              className="font-semibold text-brand-ink underline-offset-2 hover:underline"
            >
              {text.openSimulator}
            </Link>
          </span>
        </p>
      ) : null}
    </Card>
  );
}
