"use client";

import Image from "next/image";
import type { ReactNode } from "react";

import { useAppText } from "@/i18n/app/client";
import type { AppDictionary } from "@/i18n/app/types";

import { Card } from "./card";
import { cn } from "./cn";

export type Assistant = "numa" | "stive";

/**
 * Numa et Stive sont représentés par des portraits photoréalistes : la mention « IA »
 * les accompagne donc toujours (principe non négociable n° 3 du cahier des charges).
 */
function assistantText(t: AppDictionary, assistant: Assistant) {
  return assistant === "numa"
    ? { name: "Numa", role: t.ui.assistants.numaRole, aiLabel: t.common.numaAi }
    : {
        name: "Stive",
        role: t.ui.assistants.stiveRole,
        aiLabel: t.common.stiveAi,
      };
}

export function AssistantAvatar({
  assistant,
  size = 40,
  className,
}: {
  assistant: Assistant;
  size?: number;
  className?: string;
}) {
  const t = useAppText();
  const { name, aiLabel } = assistantText(t, assistant);
  return (
    <Image
      src={`/assistants/${assistant}.webp`}
      alt={t.ui.assistants.avatarAlt(name, aiLabel)}
      width={size}
      height={size}
      className={cn(
        "shrink-0 rounded-full object-cover ring-2 ring-surface",
        className,
      )}
    />
  );
}

function AiBadge({ assistant }: { assistant: Assistant }) {
  const t = useAppText();
  return (
    <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">
      {assistantText(t, assistant).aiLabel}
    </span>
  );
}

export function AssistantCard({
  assistant,
  children,
  action,
}: {
  assistant: Assistant;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const t = useAppText();
  const { name, role } = assistantText(t, assistant);
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-center gap-3">
        <AssistantAvatar assistant={assistant} size={48} />
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-bold">
            {name}
            <AiBadge assistant={assistant} />
          </p>
          <p className="text-sm text-ink-muted">{role}</p>
        </div>
      </div>
      {children ? <div className="text-sm">{children}</div> : null}
      {action}
    </Card>
  );
}
