"use client";

import {
  CalendarPlus,
  CirclePause,
  CirclePlay,
  Send,
  ShieldCheck,
} from "lucide-react";
import { useId, useState } from "react";

import type { FollowupState, Message, Triage } from "@/fixtures/types";
import { AlertBanner } from "@/ui/alert-banner";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { ChatThread } from "@/ui/chat";
import { ConfirmDialog } from "@/ui/dialog";
import { EmptyState } from "@/ui/states";
import { StatusBadge } from "@/ui/status-badge";

type Props = {
  animalName: string;
  ownerFirstName: string;
  triage: Triage;
  initialState: FollowupState;
  messages: Message[];
  lastActivity: string;
  /** Répondre au propriétaire et piloter Numa (permission owner_messages.reply). */
  canAct: boolean;
};

const stateLabel: Record<FollowupState, string> = {
  active: "Numa suit la conversation",
  human: "Vous avez repris la main : Numa est en pause",
  paused: "Suivi en pause : aucune relance n'est envoyée",
  ended: "Suivi arrêté : la conversation WhatsApp reste ouverte",
};

/**
 * Conversation et actions humaines. Démonstration locale : rien n'est enregistré
 * ni envoyé ; les vraies actions passeront par le serveur avec contrôle des droits et audit.
 */
export function FollowupWorkspace({
  animalName,
  ownerFirstName,
  triage,
  initialState,
  messages: initialMessages,
  lastActivity,
  canAct,
}: Props) {
  const [state, setState] = useState<FollowupState>(initialState);
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const composerId = useId();

  function sendDraft() {
    const text = draft.trim();
    if (!text) return;
    setMessages((current) => [
      ...current,
      {
        id: `local-${current.length}`,
        author: "vet",
        authorName: "Dr Fontaine",
        at: "à l'instant",
        dayLabel: "Aujourd'hui",
        text,
      },
    ]);
    setDraft("");
    // Écrire au propriétaire met Numa en pause jusqu'à « Reprendre Numa ».
    setState("human");
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {triage === "urgent" && !acknowledged ? (
        <AlertBanner
          tone="urgent"
          title={`Urgence signalée à ${lastActivity}, sans accusé de réception`}
          action={
            canAct ? (
              <Button size="sm" onClick={() => setAcknowledged(true)}>
                Accuser réception
              </Button>
            ) : undefined
          }
        >
          Tant que personne n&apos;accuse réception, l&apos;équipe sera prévenue
          après le délai réglé par le cabinet.
        </AlertBanner>
      ) : null}
      {triage === "urgent" && acknowledged ? (
        <AlertBanner
          tone="success"
          title="Réception de l'urgence confirmée par Dr Fontaine"
        >
          L&apos;escalade vers l&apos;équipe est annulée (démonstration, rien
          n&apos;est enregistré).
        </AlertBanner>
      ) : null}

      <Card className="flex flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="font-bold">Conversation WhatsApp</h2>
            <p className="text-sm text-ink-muted" aria-live="polite">
              {stateLabel[state]}
            </p>
          </div>
          {canAct ? (
            <div className="flex flex-wrap gap-2">
              {state === "human" || state === "paused" ? (
                <Button
                  size="sm"
                  icon={<CirclePlay aria-hidden="true" className="size-4" />}
                  onClick={() => setState("active")}
                >
                  Reprendre Numa
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<CirclePause aria-hidden="true" className="size-4" />}
                  onClick={() => setState("paused")}
                  disabled={state === "ended"}
                >
                  Mettre en pause
                </Button>
              )}
              <Button
                size="sm"
                variant="quiet"
                icon={<CalendarPlus aria-hidden="true" className="size-4" />}
              >
                Proposer un rendez-vous
              </Button>
            </div>
          ) : null}
        </div>

        <div className="flex items-start gap-2 border-b border-line bg-canvas px-5 py-3 text-sm text-ink-muted">
          <ShieldCheck
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-brand"
          />
          <p>
            Numa est une IA : elle ne pose pas de diagnostic, ne modifie aucun
            traitement et vous transmet tout signe d&apos;alerte validé dans le
            protocole.
          </p>
        </div>

        <div className="px-4 py-5 sm:px-5">
          {messages.length > 0 ? (
            <ChatThread messages={messages} />
          ) : (
            <EmptyState
              title="Aucun message pour l'instant"
              description={`Numa écrira à ${ownerFirstName} selon le protocole, dans les horaires d'envoi du cabinet.`}
            />
          )}
        </div>

        {canAct ? (
          <form
            className="border-t border-line p-4 sm:p-5"
            onSubmit={(event) => {
              event.preventDefault();
              sendDraft();
            }}
          >
            <label htmlFor={composerId} className="text-sm font-semibold">
              Écrire à {ownerFirstName}
            </label>
            <p className="mb-2 text-xs text-ink-muted">
              Le message part du WhatsApp professionnel du cabinet. Numa se met
              en pause dès que vous écrivez.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <textarea
                id={composerId}
                rows={2}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                disabled={state === "ended"}
                className="min-h-11 flex-1 resize-y rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2 text-[15px] placeholder:text-ink-muted"
                placeholder={`Votre message au sujet de ${animalName}`}
              />
              <Button
                type="submit"
                disabled={!draft.trim() || state === "ended"}
                icon={<Send aria-hidden="true" className="size-4" />}
              >
                Envoyer
              </Button>
            </div>
          </form>
        ) : (
          <p className="border-t border-line p-4 text-sm text-ink-muted sm:p-5">
            Lecture seule : répondre au propriétaire demande un droit que
            l&apos;administrateur peut vous ouvrir.
          </p>
        )}
      </Card>

      {canAct ? (
        <div className="flex flex-wrap items-center gap-3">
          {state === "ended" ? (
            <StatusBadge status="paused" label="Suivi arrêté" />
          ) : (
            <ConfirmDialog
              triggerLabel="Arrêter le suivi"
              title={`Arrêter le suivi de ${animalName} ?`}
              description="Numa n'enverra plus de relance. La conversation WhatsApp reste ouverte et l'historique est conservé."
              confirmLabel="Arrêter le suivi"
              tone="urgent"
              onConfirm={() => setState("ended")}
            />
          )}
          <p className="text-xs text-ink-muted">
            Démonstration : aucune action n&apos;est enregistrée ni envoyée.
          </p>
        </div>
      ) : null}
    </div>
  );
}
