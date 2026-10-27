"use client";

import { Check, Eraser, LoaderCircle, Send, Sparkles, X } from "lucide-react";
import { useActionState, useId } from "react";

import { useAppText } from "@/i18n/app/client";
import { Button } from "@/ui/button";

import { ActionMessage } from "../action-message";
import { initialActionState } from "../action-state";
import { askStiveAction, clearStiveAction, decideStiveAction } from "./actions";

const MAX_QUESTION = 500;

/**
 * Zone de demande et suggestions en un clic. Une suggestion envoie son texte tel quel, avec
 * le dossier d'où vient la demande s'il y en a un ; le serveur revalide tout.
 */
export function AskStive({
  followupId,
  suggestions,
  placeholder,
}: {
  followupId: string | null;
  suggestions: string[];
  placeholder: string;
}) {
  const [state, action, pending] = useActionState(
    askStiveAction,
    initialActionState,
  );
  const id = useId();
  const words = useAppText().stive;
  const text = words.ask;
  const context = followupId ? (
    <input type="hidden" name="followupId" value={followupId} />
  ) : null;

  return (
    <div className="grid gap-3 border-t border-line p-4 sm:p-5">
      {suggestions.length ? (
        <ul aria-label={text.suggestions} className="flex flex-wrap gap-2">
          {suggestions.map((suggestion) => (
            <li key={suggestion}>
              <form action={action}>
                {context}
                <input type="hidden" name="question" value={suggestion} />
                <button
                  type="submit"
                  disabled={pending}
                  className="inline-flex min-h-9 items-center rounded-full border border-line/80 bg-surface px-3.5 text-left text-[13px] font-medium text-ink transition-colors hover:border-accent/40 hover:bg-accent/5 disabled:opacity-50"
                >
                  {suggestion}
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : null}
      <form action={action} className="grid gap-2">
        {context}
        <label htmlFor={id} className="sr-only">
          {text.label}
        </label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <textarea
            id={id}
            name="question"
            rows={2}
            required
            maxLength={MAX_QUESTION}
            placeholder={placeholder}
            className="min-h-11 min-w-0 flex-1 resize-y rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2 text-[15px] placeholder:text-ink-muted"
          />
          <Button
            type="submit"
            disabled={pending}
            aria-busy={pending}
            icon={<Send aria-hidden="true" className="size-4" />}
          >
            {text.submit}
          </Button>
        </div>
      </form>
      <p role="status" className="min-h-0 text-sm text-ink-muted empty:hidden">
        {pending ? (
          <span className="inline-flex items-center gap-2">
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            {words.thinking}
          </span>
        ) : null}
      </p>
      <ActionMessage state={state} />
    </div>
  );
}

/**
 * Barre « Demander à Stive » du tableau de bord : la réponse s'ouvre dans l'écran de Stive,
 * par la même action que la conversation.
 */
export function AskStiveBar({ placeholder }: { placeholder: string }) {
  const [state, action, pending] = useActionState(
    askStiveAction,
    initialActionState,
  );
  const id = useId();
  const text = useAppText().stive.ask;
  return (
    <form action={action} className="mt-5 grid gap-2">
      <label htmlFor={id} className="sr-only">
        {text.label}
      </label>
      <div className="relative">
        <Sparkles
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-5 z-10 size-5 -translate-y-1/2 text-accent"
        />
        <input
          id={id}
          name="question"
          type="text"
          required
          autoComplete="off"
          maxLength={MAX_QUESTION}
          placeholder={placeholder}
          className="h-14 w-full rounded-full border border-line/80 bg-surface/90 pr-16 pl-13 text-[15px] text-ink shadow-[0_1px_2px_rgb(11_18_32/0.05),0_10px_30px_-12px_rgb(11_18_32/0.18)] backdrop-blur placeholder:text-ink-muted focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
        />
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="absolute top-1/2 right-2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-accent text-white shadow-[0_6px_16px_-6px_rgb(91_79_224/0.8)] transition-transform hover:scale-105 disabled:opacity-60"
        >
          <Send aria-hidden="true" className="size-5" />
          <span className="sr-only">{text.submit}</span>
        </button>
      </div>
      <ActionMessage state={state} />
    </form>
  );
}

/** Boutons d'une carte « À confirmer » ; `labels` : noms accessibles déjà traduits. */
export function ProposalDecision({
  proposalId,
  confirm,
  decline,
}: {
  proposalId: string;
  confirm: { text: string; label: string };
  decline?: { text: string; label: string };
}) {
  const [state, action, pending] = useActionState(
    decideStiveAction,
    initialActionState,
  );
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="proposalId" value={proposalId} />
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          name="decision"
          value="confirm"
          size="sm"
          disabled={pending}
          aria-busy={pending}
          aria-label={confirm.label}
          icon={<Check aria-hidden="true" className="size-4" />}
        >
          {confirm.text}
        </Button>
        {decline ? (
          <Button
            type="submit"
            name="decision"
            value="decline"
            size="sm"
            variant="secondary"
            disabled={pending}
            aria-label={decline.label}
            icon={<X aria-hidden="true" className="size-4" />}
          >
            {decline.text}
          </Button>
        ) : null}
      </div>
      <ActionMessage state={state} />
    </form>
  );
}

export function ClearConversation() {
  const [state, action, pending] = useActionState(
    clearStiveAction,
    initialActionState,
  );
  const text = useAppText().stive.privacy;
  return (
    <form action={action} className="grid gap-2">
      <Button
        type="submit"
        size="sm"
        variant="secondary"
        disabled={pending}
        aria-busy={pending}
        icon={<Eraser aria-hidden="true" className="size-4" />}
      >
        {text.clear}
      </Button>
      <ActionMessage state={state} />
    </form>
  );
}
