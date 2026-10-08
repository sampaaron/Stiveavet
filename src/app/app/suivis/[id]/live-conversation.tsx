import { FlaskConical, ShieldCheck } from "lucide-react";
import Link from "next/link";

import type {
  ConsentState,
  ConversationMessage,
  ConversationView,
  MessageAttachment,
} from "@/domains/conversations/service";
import type { SignedLink } from "@/domains/fichiers/liens";
import { durationLabel } from "@/domains/fichiers/media";
import type { Attachment, Message } from "@/fixtures/types";
import { Card } from "@/ui/card";
import { ChatThread } from "@/ui/chat";
import { formatDate, formatTime } from "@/ui/format";
import { EmptyState } from "@/ui/states";

import { OwnerComposer, ResumeNumaButton } from "./conversation-controls";

const DELIVERY_NOTE: Partial<
  Record<NonNullable<ConversationMessage["delivery"]>, string>
> = {
  queued: "envoi en cours",
  failed: "non envoyé",
};

function toAttachment(
  attachment: MessageAttachment,
  links: Record<string, SignedLink>,
): Attachment {
  if (attachment.deleted)
    return {
      kind: "deleted",
      label:
        attachment.kind === "photo"
          ? "Photo supprimée (durée de conservation atteinte)"
          : "Message vocal supprimé (durée de conservation atteinte)",
    };
  const src = links[attachment.id]?.url;
  return attachment.kind === "photo"
    ? {
        kind: "photo",
        label: "Photo",
        src,
        observations: attachment.observations,
      }
    : {
        kind: "voice",
        durationLabel: durationLabel(attachment.durationMs),
        transcript: attachment.transcript,
        src,
      };
}

/** Avec deux propriétaires : dans le groupe, ou à qui le message a été écrit en direct. */
function channelNote(
  message: ConversationMessage,
  twoOwners: boolean,
): string | undefined {
  if (!twoOwners) return undefined;
  if (message.channel === "group") return "groupe";
  if (message.author !== "owner" && message.contactName)
    return `à ${message.contactName}`;
  return undefined;
}

function toBubble(
  message: ConversationMessage,
  links: Record<string, SignedLink>,
  ownerFirstName: string | null,
  twoOwners: boolean,
): Message {
  const notes = [
    channelNote(message, twoOwners),
    message.delivery ? DELIVERY_NOTE[message.delivery] : undefined,
  ].filter(Boolean);
  return {
    id: message.id,
    author: message.author,
    authorName:
      (message.author === "owner"
        ? (message.contactName ?? ownerFirstName)
        : message.authorName) ?? undefined,
    at: [formatTime(message.occurredAt), ...notes].join(" · "),
    dayLabel: formatDate(message.occurredAt),
    text: message.body,
    triage: message.triage ?? undefined,
    attachment: message.attachment
      ? toAttachment(message.attachment, links)
      : undefined,
  };
}

const CONSENT_LABEL: Record<ConsentState, string> = {
  requested: "accord demandé",
  given: "accord donné",
  withdrawn: "STOP",
};

/** Avec deux propriétaires : l'état de chacun et du groupe, en une ligne. */
function contactsLine(view: ConversationView): string | null {
  if (view.contacts.length < 2) return null;
  const people = view.contacts.map((contact) => {
    const state = contact.stopRequested
      ? "STOP dans le groupe, réponse attendue"
      : contact.leftGroup
        ? "a quitté le groupe"
        : contact.consent
          ? CONSENT_LABEL[contact.consent]
          : "pas encore contacté";
    return `${contact.firstName} : ${state}`;
  });
  const group = view.group
    ? "Groupe WhatsApp ouvert"
    : "Groupe créé quand les deux auront accepté";
  return [...people, group].join(" · ");
}

/** État de la conversation, en une phrase : accord du propriétaire d'abord, puis le suivi. */
function stateLabel(view: ConversationView): string {
  if (view.stoppedByOwner)
    return "Un propriétaire a demandé l'arrêt du suivi : plus aucun message automatique n'est envoyé.";
  if (view.contacts.length > 1 && view.recipients) return followupLabel(view);
  if (view.consent === null)
    return "Numa n'a pas encore écrit : son premier message part à l'heure prévue.";
  if (view.consent === "requested")
    return "En attente de l'accord du propriétaire : aucun contenu de suivi avant son OUI.";
  if (view.consent === "withdrawn")
    return "Le propriétaire a écrit STOP : plus aucun message ne lui est envoyé.";
  return followupLabel(view);
}

function followupLabel(view: ConversationView): string {
  switch (view.status) {
    case "human_takeover":
      return "Vous avez repris la main : Numa est en pause.";
    case "paused":
      return "Suivi en pause : Numa n'envoie rien.";
    case "ended":
      return view.endedAutomatically
        ? "Suivi automatisé terminé à la date de contrôle : Numa répond encore si le propriétaire écrit, et vous êtes prévenu."
        : "Suivi arrêté : la conversation reste consultable.";
    default:
      return "Numa suit la conversation.";
  }
}

/** Conversation WhatsApp réelle d'un suivi lancé (données en base). */
export function LiveConversation({
  view,
  links,
  simulatorHref,
}: {
  view: ConversationView;
  /** Liens de lecture signés des photos et vocaux, pour la personne qui consulte. */
  links: Record<string, SignedLink>;
  /** Lien vers le simulateur du propriétaire, en local seulement. */
  simulatorHref: string | null;
}) {
  // Écrire n'est possible que vers un propriétaire qui a donné son accord.
  const canCompose =
    view.rights.canWrite && view.recipients !== null && !view.isTest;
  const ownerFirstName = view.ownerFirstName ?? "le propriétaire";
  const twoOwners = view.contacts.length > 1;
  const contacts = contactsLine(view);

  return (
    <Card className="flex flex-col" id="conversation">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h2 className="font-bold">Conversation WhatsApp</h2>
          <p className="text-sm text-ink-muted">{stateLabel(view)}</p>
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
        <p>
          Numa est une IA : elle ne pose pas de diagnostic, ne modifie aucun
          traitement et renvoie toute question médicale au vétérinaire.
        </p>
      </div>

      <div className="px-4 py-5 sm:px-5">
        {view.messages.length > 0 ? (
          <ChatThread
            messages={view.messages.map((message) =>
              toBubble(message, links, view.ownerFirstName, twoOwners),
            )}
          />
        ) : (
          <EmptyState
            title="Aucun message pour l'instant"
            description={
              view.isTest
                ? "Suivi test : rien n'est envoyé au propriétaire."
                : `Numa écrira à ${ownerFirstName} à l'heure choisie, dans la plage d'envoi du cabinet.`
            }
          />
        )}
      </div>

      {canCompose ? (
        <OwnerComposer
          followupId={view.followupId}
          ownerFirstName={view.recipients ?? ownerFirstName}
          animalName={view.animalName}
          pausesNuma={view.status === "active"}
        />
      ) : (
        <p className="border-t border-line p-4 text-sm text-ink-muted sm:p-5">
          {!view.rights.canWrite
            ? "Lecture seule : répondre au propriétaire demande un droit que l'administrateur peut vous ouvrir."
            : "Vous pourrez écrire au propriétaire une fois son accord donné."}
        </p>
      )}

      {simulatorHref ? (
        <p className="flex items-center gap-2 border-t border-dashed border-line px-5 py-3 text-xs text-ink-muted">
          <FlaskConical aria-hidden="true" className="size-4 shrink-0" />
          <span>
            Environnement local :{" "}
            <Link
              href={simulatorHref}
              className="font-semibold text-brand-ink underline-offset-2 hover:underline"
            >
              ouvrir le simulateur du propriétaire
            </Link>
          </span>
        </p>
      ) : null}
    </Card>
  );
}
