"use client";

import { FilePlus2 } from "lucide-react";
import { useActionState, useId, useRef } from "react";

import { DOCUMENT_CATEGORIES } from "@/domains/documents/schema";
import { useAppText } from "@/i18n/app/client";
import { Button } from "@/ui/button";
import { ConfirmDialog } from "@/ui/dialog";
import { FileDrop } from "@/ui/file-drop";
import { TextField } from "@/ui/text-field";

import { ActionMessage, selectClasses } from "../action-message";
import { initialActionState } from "../action-state";
import { addDocumentAction, removeDocumentAction } from "./actions";

/** Ajout d'un document : un titre, une catégorie, un fichier (type vérifié par le serveur). */
export function AddDocumentForm() {
  const [state, action, pending] = useActionState(
    addDocumentAction,
    initialActionState,
  );
  const text = useAppText().hub.documents;
  const id = useId();
  return (
    <form action={action} className="grid gap-4">
      <TextField
        name="title"
        label={text.upload.titleLabel}
        placeholder={text.upload.titlePlaceholder}
        required
        maxLength={120}
        autoComplete="off"
      />
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-category`} className="text-sm font-semibold">
          {text.upload.categoryLabel}
        </label>
        <select
          id={`${id}-category`}
          name="category"
          required
          defaultValue="owner_sheet"
          className={selectClasses}
        >
          {DOCUMENT_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {text.categories[category]}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-file`} className="text-sm font-semibold">
          {text.upload.fileLabel}
        </label>
        <FileDrop
          id={`${id}-file`}
          name="file"
          variant="document"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          describedBy={`${id}-hint`}
        />
        <p id={`${id}-hint`} className="text-xs text-ink-muted">
          {text.upload.description}
        </p>
      </div>
      <div>
        <Button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          icon={<FilePlus2 aria-hidden="true" className="size-4" />}
        >
          {text.upload.submit}
        </Button>
      </div>
      <ActionMessage state={state} />
    </form>
  );
}

/** Suppression confirmée dans une fenêtre, puis envoyée par le formulaire caché. */
export function RemoveDocumentButton({
  documentId,
  title,
}: {
  documentId: string;
  title: string;
}) {
  const [state, action] = useActionState(
    removeDocumentAction,
    initialActionState,
  );
  const form = useRef<HTMLFormElement>(null);
  const text = useAppText().hub.documents.remove;
  return (
    <form ref={form} action={action}>
      <input type="hidden" name="documentId" value={documentId} />
      <ConfirmDialog
        triggerLabel={text.trigger}
        triggerAriaLabel={text.triggerLabel(title)}
        triggerSize="sm"
        title={text.title(title)}
        description={text.description}
        confirmLabel={text.confirm}
        tone="urgent"
        onConfirm={() => form.current?.requestSubmit()}
      />
      <ActionMessage state={state} />
    </form>
  );
}
