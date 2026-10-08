import { FlaskConical, ShieldCheck } from "lucide-react";
import Link from "next/link";

import type {
  ConversationMessage,
  ConversationView,
} from "@/domains/conversations/service";
import type { Message } from "@/fixtures/types";
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

function toBubble(message: ConversationMessage): Message {
  const note = message.delivery ? DELIVERY_NOTE[message.delivery] : undefined;
  return {
    id: message.id,
    author: message.author,
    authorName: message.authorName ?? undefined,
    at: note
      ? `${formatTime(message.occurredAt)} · ${note}`
      : formatTime(message.occurredAt),
    dayLabel: formatDate(message.occurredAt),
    text: message.body,
    triage: message.triage ?? undefined,
  };
}

/** État de la conversation, en une phrase : accord du propriétaire d'abord, puis le suivi. */
function stateLabel(view: ConversationView): string {
  if (view.consent === null)
    return "Numa n'a pas encore écrit : son premier message part à l'heure prévue.";
  if (view.consent === "requested")
    return "En attente de l'accord du propriétaire : aucun contenu de suivi avant son OUI.";
  if (view.consent === "withdrawn")
    return "Le propriétaire a écrit STOP : plus aucun message ne lui est envoyé.";
  switch (view.status) {
    case "human_takeover":
      return "Vous avez repris la main : Numa est en pause.";
    case "paused":
      return "Suivi en pause : Numa n'envoie rien.";
    case "ended":
      return "Suivi arrêté : la conversation reste consultable.";
    default:
      return "Numa suit la conversation.";
  }
}

/** Conversation WhatsApp réelle d'un suivi lancé (données en base). */
export function LiveConversation({
  view,
  simulatorHref,
}: {
  view: ConversationView;
  /** Lien vers le simulateur du propriétaire, en local seulement. */
  simulatorHref: string | null;
}) {
  const canCompose =
    view.rights.canWrite && view.consent === "given" && !view.isTest;
  const ownerFirstName = view.ownerFirstName ?? "le propriétaire";

  return (
    <Card className="flex flex-col" id="conversation">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h2 className="font-bold">Conversation WhatsApp</h2>
          <p className="text-sm text-ink-muted">{stateLabel(view)}</p>
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
          <ChatThread messages={view.messages.map(toBubble)} />
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
          ownerFirstName={ownerFirstName}
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
