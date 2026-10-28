"use client";

import {
  CirclePlay,
  Languages,
  MessageSquareQuote,
  Send,
  Sparkles,
} from "lucide-react";
import { useActionState, useId, useRef, useState } from "react";

import { useAppText } from "@/i18n/app/client";
import { AiBadge } from "@/ui/assistant-card";
import { Button } from "@/ui/button";

import { ActionMessage, selectClasses } from "../../action-message";
import { initialActionState } from "../../action-state";
import { resumeNumaAction, writeToOwnerAction } from "../conversation-actions";

import { setOwnerLanguageAction } from "./actions";

const MAX_BODY = 4096;

/**
 * Réponse prête (ADR 0048) : un modèle du cabinet, ou une phrase d'organisation préparée par
 * Stive. Déjà remplie pour ce dossier par le serveur ; elle n'est que posée dans la zone.
 */
export type ReadyReply = {
  key: string;
  label: string;
  text: string;
  source: "cabinet" | "stive";
};

/** Message de l'équipe au propriétaire ; le serveur revalide tout (droit, accord, état). */
export function OwnerComposer({
  followupId,
  recipients,
  animalName,
  pausesNuma,
  draft = null,
  ready = [],
}: {
  followupId: string;
  /** Prénoms des destinataires, déjà mis en liste (« Antoine et Chloé »). */
  recipients: string;
  animalName: string;
  /** Numa est active : écrire la met en pause. */
  pausesNuma: boolean;
  /** Brouillon de Stive : seulement posé dans la zone, envoyé par le bouton. */
  draft?: string | null;
  /** Réponses prêtes : un clic pose le texte, l'envoi reste au bouton « Envoyer ». */
  ready?: ReadyReply[];
}) {
  const [state, action, pending] = useActionState(
    writeToOwnerAction,
    initialActionState,
  );
  const id = useId();
  const t = useAppText();
  const text = t.dossier.conversation.composer;
  const field = useRef<HTMLTextAreaElement>(null);
  const [placed, setPlaced] = useState<ReadyReply | null>(null);
  const place = (reply: ReadyReply) => {
    const area = field.current;
    if (!area) return;
    area.value = reply.text.slice(0, MAX_BODY);
    area.rows = 5;
    area.focus();
    area.setSelectionRange(area.value.length, area.value.length);
    setPlaced(reply);
  };

  return (
    <form
      action={action}
      className="grid gap-2 border-t border-line p-4 sm:p-5"
    >
      <input type="hidden" name="followupId" value={followupId} />
      <label htmlFor={id} className="text-sm font-semibold">
        {text.label(recipients)}
      </label>
      <p id={`${id}-aide`} className="text-xs text-ink-muted">
        {text.help} {pausesNuma ? text.pausesNuma : text.staysPaused}
      </p>
      {ready.length > 0 ? (
        <div
          role="group"
          aria-labelledby={`${id}-pretes`}
          className="flex flex-wrap items-center gap-2"
        >
          <span
            id={`${id}-pretes`}
            className="text-xs font-semibold text-ink-muted"
          >
            {text.ready.title}
          </span>
          {ready.map((reply) => (
            <button
              key={reply.key}
              type="button"
              onClick={() => place(reply)}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-canvas/60 px-3 text-sm font-medium transition-colors hover:border-brand hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {reply.source === "stive" ? (
                <Sparkles
                  aria-hidden="true"
                  className="size-3.5 shrink-0 text-accent"
                />
              ) : (
                <MessageSquareQuote
                  aria-hidden="true"
                  className="size-3.5 shrink-0 text-brand"
                />
              )}
              {reply.label}
              {reply.source === "stive" ? (
                <span className="sr-only"> {text.ready.byStive}</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
      {placed ? (
        <p
          role="status"
          className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-ink-muted"
        >
          {placed.source === "stive" ? <AiBadge assistant="stive" /> : null}
          {text.ready.placed(placed.label)}
        </p>
      ) : draft ? (
        <p className="flex items-center gap-1.5 text-sm font-medium text-accent">
          <Sparkles aria-hidden="true" className="size-4 shrink-0" />
          {t.stive.draftLoaded}
        </p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <textarea
          ref={field}
          id={id}
          name="body"
          maxLength={MAX_BODY}
          defaultValue={draft ?? undefined}
          rows={draft ? 5 : 2}
          aria-describedby={`${id}-aide`}
          className="min-h-11 min-w-0 flex-1 resize-y rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2 text-[15px] placeholder:text-ink-muted"
          placeholder={text.placeholder(animalName)}
        />
        <Button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          icon={<Send aria-hidden="true" className="size-4" />}
        >
          {text.send}
        </Button>
      </div>
      <ActionMessage state={state} />
    </form>
  );
}

/** « Reprendre Numa » : seul un vétérinaire rend la main à l'assistante. */
export function ResumeNumaButton({ followupId }: { followupId: string }) {
  const [state, action, pending] = useActionState(
    resumeNumaAction,
    initialActionState,
  );
  const t = useAppText();
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="followupId" value={followupId} />
      <Button
        type="submit"
        size="sm"
        disabled={pending}
        aria-busy={pending}
        icon={<CirclePlay aria-hidden="true" className="size-4" />}
      >
        {t.dossier.conversation.resumeNuma}
      </Button>
      <ActionMessage state={state} />
    </form>
  );
}

/**
 * Correction par un vétérinaire de la langue dans laquelle Numa écrit à un propriétaire
 * (lot 19). Le serveur revérifie le droit ; le choix prime ensuite sur la détection.
 */
export function OwnerLanguageForm({
  followupId,
  role,
  firstName,
  language,
}: {
  followupId: string;
  role: "primary" | "secondary";
  firstName: string;
  language: "fr" | "en";
}) {
  const [state, action, pending] = useActionState(
    setOwnerLanguageAction,
    initialActionState,
  );
  const id = useId();
  const t = useAppText();
  const text = t.dossier.contacts.languageForm;
  return (
    <form action={action} className="mt-2 grid gap-1.5">
      <input type="hidden" name="followupId" value={followupId} />
      <input type="hidden" name="role" value={role} />
      <label htmlFor={id} className="text-sm font-semibold">
        {text.label(firstName)}
      </label>
      <p id={`${id}-aide`} className="text-xs text-ink-muted">
        {text.help}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select
          id={id}
          name="language"
          defaultValue={language}
          aria-describedby={`${id}-aide`}
          className={selectClasses}
        >
          <option value="fr">{t.labels.languages.fr}</option>
          <option value="en">{t.labels.languages.en}</option>
        </select>
        <Button
          type="submit"
          variant="secondary"
          className="h-11"
          disabled={pending}
          aria-busy={pending}
          icon={<Languages aria-hidden="true" className="size-4" />}
        >
          {text.submit}
        </Button>
      </div>
      <ActionMessage state={state} />
    </form>
  );
}
