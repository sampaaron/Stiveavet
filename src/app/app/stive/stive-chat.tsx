"use client";

import { FileText, Send, Trash2 } from "lucide-react";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

import { useAppText } from "@/i18n/app/client";
import { AlertBanner } from "@/ui/alert-banner";
import { AssistantAvatar } from "@/ui/assistant-card";
import { Button } from "@/ui/button";
import { cn } from "@/ui/cn";

import { ActionMessage, selectClasses } from "../action-message";

import { askStiveAction, deleteStiveConversationAction } from "./actions";
import { initialStiveState } from "./state";

const MAX_MESSAGE = 2000;

export type StiveChatMessage = {
  id: string;
  author: "vet" | "stive";
  body: string;
  /** Mention du dossier sur lequel la réponse s'est appuyée. */
  basedOn: string | null;
};

export type StiveFollowupOption = { value: string; label: string };

function Bubble({
  author,
  children,
  basedOn,
}: {
  author: "vet" | "stive";
  children: string;
  basedOn?: string | null;
}) {
  const t = useAppText();
  const fromStive = author === "stive";
  return (
    <li
      className={cn(
        "flex items-end gap-2.5",
        fromStive ? "justify-start" : "justify-end",
      )}
    >
      {fromStive ? (
        <AssistantAvatar assistant="stive" size={32} className="size-8" />
      ) : null}
      <div
        className={cn(
          "max-w-[85%] rounded-[var(--radius-card)] px-4 py-3 text-[15px] leading-relaxed sm:max-w-[75%]",
          fromStive
            ? "rounded-bl-md border border-line/80 bg-surface text-ink shadow-[var(--shadow-card)]"
            : "rounded-br-md bg-brand text-white",
        )}
      >
        <p className="sr-only">{fromStive ? "Stive" : t.stive.you}</p>
        <p className="break-words whitespace-pre-wrap">{children}</p>
        {fromStive && basedOn ? (
          <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-ink-muted">
            <FileText aria-hidden="true" className="size-3.5" />
            {basedOn}
          </p>
        ) : null}
      </div>
    </li>
  );
}

/** Fil de la conversation, zone de saisie et choix du dossier ; le serveur revalide tout. */
export function StiveChat({
  conversationId,
  messages,
  followupOptions,
  defaultFollowup,
  firstName,
}: {
  conversationId: string | null;
  messages: StiveChatMessage[];
  followupOptions: StiveFollowupOption[];
  defaultFollowup: string;
  firstName: string;
}) {
  const t = useAppText();
  const text = t.stive;
  const [state, action, pending] = useActionState(
    askStiveAction,
    initialStiveState,
  );
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const followupId = useId();

  // Échec : le message revient dans la zone de saisie, prêt à être renvoyé.
  const [shownState, setShownState] = useState(state);
  if (state !== shownState) {
    setShownState(state);
    if (state.draft !== undefined) setMessage(state.draft);
  }

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, pending]);

  function submitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    )
      return;
    event.preventDefault();
    if (!pending && message.trim()) formRef.current?.requestSubmit();
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {messages.length === 0 && !pending ? (
        <div className="rounded-[var(--radius-card)] border border-line/80 bg-surface/80 p-5 sm:p-6">
          <p className="font-display text-xl font-semibold tracking-[-0.01em]">
            {text.welcome.title(firstName)}
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            {text.welcome.description}
          </p>
          <p className="mt-4 text-xs font-semibold text-ink-muted uppercase">
            {text.welcome.suggestionsLabel}
          </p>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {text.welcome.suggestions.map((suggestion) => (
              <li key={suggestion}>
                <button
                  type="button"
                  onClick={() => setMessage(suggestion)}
                  className="h-full w-full rounded-[var(--radius-control)] border border-line/80 bg-surface px-3 py-2.5 text-left text-sm text-ink transition-colors hover:border-brand/40 hover:bg-brand-soft"
                >
                  {suggestion}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ol aria-label={text.title} className="flex flex-col gap-4">
        {messages.map((item) => (
          <Bubble key={item.id} author={item.author} basedOn={item.basedOn}>
            {item.body}
          </Bubble>
        ))}
        {pending && sent ? <Bubble author="vet">{sent}</Bubble> : null}
      </ol>
      <div aria-live="polite" className="min-h-0">
        {pending ? (
          <p className="flex items-center gap-2.5 text-sm text-ink-muted">
            <AssistantAvatar assistant="stive" size={32} className="size-8" />
            <span className="inline-flex gap-1" aria-hidden="true">
              <span className="size-1.5 animate-bounce rounded-full bg-brand [animation-delay:-0.3s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-brand [animation-delay:-0.15s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-brand" />
            </span>
            {text.thinking}
          </p>
        ) : null}
      </div>
      <div ref={endRef} />

      <form
        ref={formRef}
        action={(form) => {
          setSent(message.trim());
          setMessage("");
          action(form);
        }}
        className="sticky bottom-3 grid gap-3 rounded-[var(--radius-card)] border border-line/80 bg-surface/95 p-3 shadow-[var(--shadow-card)] backdrop-blur sm:p-4"
      >
        {conversationId ? (
          <input type="hidden" name="conversationId" value={conversationId} />
        ) : null}
        {followupOptions.length > 0 ? (
          <div className="grid gap-1 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:gap-3">
            <label htmlFor={followupId} className="text-sm font-semibold">
              {text.followup.label}
            </label>
            <select
              id={followupId}
              name="followup"
              defaultValue={defaultFollowup}
              aria-describedby={`${followupId}-aide`}
              className={selectClasses}
            >
              <option value="auto">{text.followup.auto}</option>
              <option value="none">{text.followup.none}</option>
              {followupOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p
              id={`${followupId}-aide`}
              className="text-xs text-ink-muted sm:col-span-2"
            >
              {text.followup.help}
            </p>
          </div>
        ) : (
          <input type="hidden" name="followup" value="none" />
        )}
        <label htmlFor={inputId} className="sr-only">
          {text.composer.label}
        </label>
        <div className="flex items-end gap-2">
          <textarea
            id={inputId}
            name="message"
            rows={2}
            required
            maxLength={MAX_MESSAGE}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={submitOnEnter}
            aria-describedby={`${inputId}-aide`}
            placeholder={text.composer.placeholder}
            className="max-h-60 min-h-12 min-w-0 flex-1 resize-y rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2.5 text-[15px] placeholder:text-ink-muted focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
          />
          <Button
            type="submit"
            disabled={pending || !message.trim()}
            aria-busy={pending}
            icon={<Send aria-hidden="true" className="size-4" />}
          >
            {text.composer.send}
          </Button>
        </div>
        <p id={`${inputId}-aide`} className="text-xs text-ink-muted">
          {text.composer.hint}
        </p>
        {state.error ? <AlertBanner tone="urgent" title={state.error} /> : null}
      </form>
    </div>
  );
}

/** Effacement d'une conversation, après confirmation. */
export function DeleteConversationButton({
  conversationId,
}: {
  conversationId: string;
}) {
  const text = useAppText().stive.remove;
  const [state, action, pending] = useActionState(
    deleteStiveConversationAction,
    initialStiveState,
  );
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(text.confirm)) event.preventDefault();
      }}
      className="grid gap-2"
    >
      <input type="hidden" name="conversationId" value={conversationId} />
      <Button
        type="submit"
        variant="quiet"
        size="sm"
        disabled={pending}
        aria-busy={pending}
        icon={<Trash2 aria-hidden="true" className="size-4" />}
      >
        {text.button}
      </Button>
      <ActionMessage state={state} />
    </form>
  );
}
