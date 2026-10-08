"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";

import { useAppText } from "@/i18n/app/client";

import { Button } from "./button";
import { cn } from "./cn";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
};

/**
 * Fenêtre modale accessible fondée sur l'élément natif <dialog> :
 * le reste de la page devient inerte, Échap ferme, le focus revient à l'élément d'origine.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const close = useAppText().common.close;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={onClose}
      onClick={(event) => {
        // Un clic sur le fond (hors du contenu) ferme la fenêtre.
        if (event.target === event.currentTarget) onClose();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-[var(--radius-card)] border border-line bg-surface p-0 text-ink shadow-[var(--shadow-card)] backdrop:bg-ink/30"
    >
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-lg font-bold tracking-tight">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="-m-1 rounded-md p-1 text-ink-muted hover:bg-canvas-subtle"
          >
            <X aria-hidden="true" className="size-5" />
            <span className="sr-only">{close}</span>
          </button>
        </div>
        {description ? (
          <p id={descriptionId} className="mt-2 text-sm text-ink-muted">
            {description}
          </p>
        ) : null}
        {children ? <div className="mt-4">{children}</div> : null}
      </div>
      {footer ? (
        <div className="flex flex-wrap justify-end gap-2 border-t border-line px-6 py-4">
          {footer}
        </div>
      ) : null}
    </dialog>
  );
}

type ConfirmDialogProps = {
  triggerLabel: string;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  /** `urgent` pour une action lourde de conséquences (arrêt d'un suivi, retrait d'un accès). */
  tone?: "default" | "urgent";
};

/** Demande une confirmation explicite avant toute action ayant un effet réel. */
export function ConfirmDialog({
  triggerLabel,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  tone = "default",
}: ConfirmDialogProps) {
  const [open, setOpen] = useState(false);
  const t = useAppText();
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        description={description}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {cancelLabel ?? t.common.cancel}
            </Button>
            <Button
              className={cn(
                tone === "urgent" && "bg-urgent hover:bg-urgent/90",
              )}
              onClick={() => {
                onConfirm();
                setOpen(false);
              }}
            >
              {confirmLabel}
            </Button>
          </>
        }
      />
    </>
  );
}
