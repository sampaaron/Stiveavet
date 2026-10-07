import Image from "next/image";
import type { ReactNode } from "react";

import { Card } from "./card";
import { cn } from "./cn";

export type Assistant = "numa" | "stive";

/**
 * Numa et Stive sont représentés par des portraits photoréalistes : la mention « IA »
 * les accompagne donc toujours (principe non négociable n° 3 du cahier des charges).
 */
const assistants: Record<
  Assistant,
  { name: string; role: string; aiLabel: string }
> = {
  numa: {
    name: "Numa",
    role: "Échange avec les propriétaires sur WhatsApp",
    aiLabel: "Assistante IA",
  },
  stive: {
    name: "Stive",
    role: "Aide l'équipe du cabinet dans Stivea",
    aiLabel: "Assistant IA",
  },
};

export function AssistantAvatar({
  assistant,
  size = 40,
  className,
}: {
  assistant: Assistant;
  size?: number;
  className?: string;
}) {
  const { name, aiLabel } = assistants[assistant];
  return (
    <Image
      src={`/assistants/${assistant}.webp`}
      alt={`${name}, ${aiLabel.toLowerCase()}`}
      width={size}
      height={size}
      className={cn(
        "shrink-0 rounded-full object-cover ring-2 ring-surface",
        className,
      )}
    />
  );
}

export function AiBadge({ assistant }: { assistant: Assistant }) {
  return (
    <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">
      {assistants[assistant].aiLabel}
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
  const { name, role } = assistants[assistant];
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
