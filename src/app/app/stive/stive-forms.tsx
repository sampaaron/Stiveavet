"use client";

import { Check, Eraser, Send, X } from "lucide-react";
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
}: {
  followupId: string | null;
  suggestions: string[];
}) {
  const [state, action, pending] = useActionState(
    askStiveAction,
    initialActionState,
  );
  const id = useId();
  const text = useAppText().stive.ask;
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
            placeholder={text.placeholder}
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
      <ActionMessage state={state} />
    </div>
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
