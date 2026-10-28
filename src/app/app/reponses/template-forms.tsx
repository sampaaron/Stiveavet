"use client";

import { MessageSquarePlus, Save } from "lucide-react";
import { useActionState, useId, useRef } from "react";

import { useAppText } from "@/i18n/app/client";
import { Button } from "@/ui/button";
import { ConfirmDialog } from "@/ui/dialog";
import { TextField } from "@/ui/text-field";

import { ActionMessage, selectClasses } from "../action-message";
import { initialActionState } from "../action-state";
import {
  addTemplateAction,
  removeTemplateAction,
  saveTemplateAction,
} from "./actions";

type Template = {
  id: string;
  title: string;
  body: string;
  language: "fr" | "en";
};

/** Ajout ou modification d'un modèle : nom, langue du propriétaire, texte. */
export function TemplateForm({ template }: { template?: Template }) {
  const [state, action, pending] = useActionState(
    template ? saveTemplateAction : addTemplateAction,
    initialActionState,
  );
  const text = useAppText().hub.replies;
  const id = useId();
  return (
    <form
      action={action}
      aria-label={template ? undefined : text.form.addTitle}
      className="grid gap-4"
    >
      {template ? (
        <input type="hidden" name="templateId" value={template.id} />
      ) : null}
      <TextField
        name="title"
        label={text.form.titleLabel}
        placeholder={text.form.titlePlaceholder}
        defaultValue={template?.title}
        required
        maxLength={60}
        autoComplete="off"
      />
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-langue`} className="text-sm font-semibold">
          {text.form.languageLabel}
        </label>
        <select
          id={`${id}-langue`}
          name="language"
          defaultValue={template?.language ?? "fr"}
          className={selectClasses}
        >
          <option value="fr">{text.languages.fr}</option>
          <option value="en">{text.languages.en}</option>
        </select>
      </div>
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-texte`} className="text-sm font-semibold">
          {text.form.bodyLabel}
        </label>
        <textarea
          id={`${id}-texte`}
          name="body"
          required
          maxLength={1000}
          rows={5}
          defaultValue={template?.body}
          aria-describedby={`${id}-aide`}
          className="min-h-11 resize-y rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2 text-[15px] placeholder:text-ink-muted"
        />
        <p id={`${id}-aide`} className="text-xs text-ink-muted">
          {text.form.bodyHint}
        </p>
      </div>
      <div>
        <Button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          icon={
            template ? (
              <Save aria-hidden="true" className="size-4" />
            ) : (
              <MessageSquarePlus aria-hidden="true" className="size-4" />
            )
          }
        >
          {template ? text.form.save : text.form.add}
        </Button>
      </div>
      <ActionMessage state={state} />
    </form>
  );
}

/** Suppression confirmée dans une fenêtre, puis envoyée par le formulaire caché. */
export function RemoveTemplateButton({
  templateId,
  title,
}: {
  templateId: string;
  title: string;
}) {
  const [state, action] = useActionState(
    removeTemplateAction,
    initialActionState,
  );
  const form = useRef<HTMLFormElement>(null);
  const text = useAppText().hub.replies.remove;
  return (
    <form ref={form} action={action}>
      <input type="hidden" name="templateId" value={templateId} />
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
