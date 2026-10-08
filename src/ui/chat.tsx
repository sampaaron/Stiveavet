"use client";

import { FileX, ImageIcon, Mic, ScanEye } from "lucide-react";

import type { Message } from "@/fixtures/types";
import { useAppText } from "@/i18n/app/client";
import type { AppDictionary } from "@/i18n/app/types";

import { AssistantAvatar } from "./assistant-card";
import { cn } from "./cn";
import { StatusBadge } from "./status-badge";

/** Fil de conversation, groupé par jour. */
export function ChatThread({ messages }: { messages: Message[] }) {
  const t = useAppText();
  const days = groupByDay(messages);
  return (
    <ol aria-label={t.ui.chat.conversation} className="flex flex-col gap-3">
      {days.map(({ day, items }) => (
        <li key={day} className="flex flex-col gap-3">
          <p className="self-center rounded-full bg-canvas-subtle px-3 py-0.5 text-xs font-semibold text-ink-muted">
            {day}
          </p>
          <ol className="flex flex-col gap-3">
            {items.map((message) => (
              <li key={message.id}>
                <ChatBubble message={message} />
              </li>
            ))}
          </ol>
        </li>
      ))}
    </ol>
  );
}

export function ChatBubble({ message }: { message: Message }) {
  const t = useAppText();
  if (message.author === "system") {
    return (
      <p className="mx-auto max-w-md text-center text-xs text-ink-muted">
        {message.text} · {message.at}
      </p>
    );
  }

  const fromCabinet = message.author !== "owner";
  return (
    <div
      className={cn(
        "flex items-end gap-2",
        fromCabinet ? "flex-row-reverse" : "flex-row",
      )}
    >
      {message.author === "numa" ? (
        <AssistantAvatar assistant="numa" size={28} />
      ) : null}
      <div
        className={cn(
          "max-w-[85%] rounded-2xl border px-4 py-2.5 sm:max-w-[75%]",
          message.author === "owner" &&
            "rounded-bl-md border-brand/15 bg-brand-soft",
          message.author === "numa" && "rounded-br-md border-line bg-surface",
          message.author === "vet" &&
            "rounded-br-md border-brand/30 bg-surface",
        )}
      >
        <p className="mb-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-ink-muted">
          {authorLabel(message, t)}
          {message.triage && message.triage !== "normal" ? (
            <StatusBadge status={message.triage} />
          ) : null}
        </p>
        {message.attachment ? (
          <AttachmentView
            attachment={message.attachment}
            ownerName={message.authorName ?? t.ui.chat.theOwner}
          />
        ) : null}
        {message.text ? (
          <p className="text-[15px] whitespace-pre-line">{message.text}</p>
        ) : null}
        <p className="mt-1 text-right text-xs text-ink-muted">{message.at}</p>
      </div>
    </div>
  );
}

function authorLabel(message: Message, t: AppDictionary): string {
  switch (message.author) {
    case "numa":
      return t.ui.chat.numaAuthor;
    case "vet":
      return t.ui.chat.vetAuthor(message.authorName ?? null);
    default:
      return message.authorName ?? t.ui.chat.owner;
  }
}

function AttachmentView({
  attachment,
  ownerName,
}: {
  attachment: NonNullable<Message["attachment"]>;
  ownerName: string;
}) {
  const t = useAppText().ui.chat;
  if (attachment.kind === "deleted")
    return (
      <p className="mb-1 flex items-center gap-2 rounded-xl bg-surface/70 p-2.5 text-sm text-ink-muted">
        <FileX aria-hidden="true" className="size-4 shrink-0" />
        {attachment.label}
      </p>
    );
  if (attachment.kind === "photo") {
    return (
      <figure className="mb-2">
        {attachment.src ? (
          // Lien signé de deux minutes, servi par l'application : pas d'optimisation d'image.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={attachment.src}
            alt={t.photoAlt(ownerName)}
            className="max-h-72 w-auto max-w-full rounded-xl border border-line bg-surface object-contain"
          />
        ) : (
          <div className="flex h-32 w-56 max-w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-ink-muted/40 bg-surface text-xs text-ink-muted">
            <ImageIcon aria-hidden="true" className="size-6" />
            {t.fictitious(attachment.label)}
          </div>
        )}
        {attachment.observations?.length ? (
          <figcaption className="mt-2 rounded-xl bg-surface/70 p-2.5 text-sm">
            <p className="flex items-center gap-1.5 font-semibold">
              <ScanEye aria-hidden="true" className="size-4 shrink-0" />
              {t.observations}
            </p>
            <ul className="mt-1 list-disc pl-5">
              {attachment.observations.map((observation) => (
                <li key={observation}>{observation}</li>
              ))}
            </ul>
          </figcaption>
        ) : null}
      </figure>
    );
  }
  return (
    <div className="mb-1 rounded-xl bg-surface/70 p-2.5">
      <p className="flex items-center gap-2 text-sm font-medium">
        <Mic aria-hidden="true" className="size-4" />
        {t.voice(attachment.durationLabel)}
      </p>
      {attachment.src ? (
        <audio
          controls
          preload="auto"
          src={attachment.src}
          aria-label={t.voiceLabel(ownerName)}
          className="mt-2 w-full max-w-xs"
        />
      ) : null}
      <p className="mt-1 text-sm">
        <span className="font-semibold">{t.transcript}</span>
        {attachment.transcript === null ? (
          <span className="text-ink-muted">{t.transcribing}</span>
        ) : (
          t.quote(attachment.transcript)
        )}
      </p>
    </div>
  );
}

function groupByDay(
  messages: Message[],
): Array<{ day: string; items: Message[] }> {
  const groups: Array<{ day: string; items: Message[] }> = [];
  for (const message of messages) {
    const last = groups.at(-1);
    if (last && last.day === message.dayLabel) last.items.push(message);
    else groups.push({ day: message.dayLabel, items: [message] });
  }
  return groups;
}
