"use client";

import { ImageUp } from "lucide-react";
import { useState } from "react";

import { useAppText } from "@/i18n/app/client";

import { cn } from "./cn";

/**
 * Zone de dépôt d'une image, dessinée comme le reste de l'interface. Le vrai champ fichier
 * couvre toute la zone : il reçoit le clic, le glisser-déposer et le clavier, et garde son
 * libellé (`id` relié au `<label>` de l'appelant).
 */
export function FileDrop({
  id,
  name,
  accept,
  describedBy,
  className,
}: {
  id: string;
  name: string;
  accept: string;
  describedBy?: string;
  className?: string;
}) {
  const t = useAppText().ui.fileDrop;
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  return (
    <div
      className={cn(
        "relative flex min-h-24 min-w-0 items-center gap-3 rounded-[var(--radius-control)] border border-dashed px-4 py-3 transition-colors focus-within:ring-2 focus-within:ring-[var(--section-accent,var(--color-brand))] focus-within:ring-offset-2",
        dragging
          ? "border-[var(--section-accent,var(--color-brand))] bg-canvas-subtle"
          : "border-ink-muted/40 bg-surface hover:bg-canvas-subtle",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="grid size-10 shrink-0 place-items-center rounded-full bg-canvas-subtle text-[var(--section-accent,var(--color-brand))]"
      >
        <ImageUp className="size-5" />
      </span>
      <span className="min-w-0 text-sm">
        {fileName ? (
          <>
            <span className="block truncate font-semibold">{fileName}</span>
            <span className="text-ink-muted">{t.replace}</span>
          </>
        ) : (
          <>
            <span className="block font-semibold">{t.prompt}</span>
            <span className="text-ink-muted">{t.browse}</span>
          </>
        )}
      </span>
      <input
        id={id}
        name={name}
        type="file"
        required
        accept={accept}
        aria-describedby={describedBy}
        onChange={(event) =>
          setFileName(event.currentTarget.files?.[0]?.name ?? null)
        }
        onDragEnter={() => setDragging(true)}
        onDragLeave={() => setDragging(false)}
        onDrop={() => setDragging(false)}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </div>
  );
}
