"use client";

import { CirclePlay, Languages, Send } from "lucide-react";
import { useActionState, useId } from "react";

import { useAppText } from "@/i18n/app/client";
import { Button } from "@/ui/button";

import { ActionMessage, selectClasses } from "../../action-message";
import { initialActionState } from "../../action-state";
import { resumeNumaAction, writeToOwnerAction } from "../conversation-actions";

import { setOwnerLanguageAction } from "./actions";

const MAX_BODY = 4096;

/** Message de l'équipe au propriétaire ; le serveur revalide tout (droit, accord, état). */
export function OwnerComposer({
  followupId,
  recipients,
  animalName,
  pausesNuma,
}: {
  followupId: string;
  /** Prénoms des destinataires, déjà mis en liste (« Antoine et Chloé »). */
  recipients: string;
  animalName: string;
  /** Numa est active : écrire la met en pause. */
  pausesNuma: boolean;
}) {
  const [state, action, pending] = useActionState(
    writeToOwnerAction,
    initialActionState,
  );
  const id = useId();
  const text = useAppText().dossier.conversation.composer;

  return (
    <form
      action={action}
      className="grid gap-2 border-t border-line p-4 sm:p-5"
    >
      <input type="hidden" name="followupId" value={followupId} />
      <label htmlFor={id} className="text-sm font-semibold">
        {text.label(recipients)}
      </label>
      <p id={`${id}-aide`} className="text-xs text-ink-muted">
        {text.help} {pausesNuma ? text.pausesNuma : text.staysPaused}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <textarea
          id={id}
          name="body"
          rows={2}
          maxLength={MAX_BODY}
          aria-describedby={`${id}-aide`}
          className="min-h-11 min-w-0 flex-1 resize-y rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2 text-[15px] placeholder:text-ink-muted"
          placeholder={text.placeholder(animalName)}
        />
        <Button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          icon={<Send aria-hidden="true" className="size-4" />}
        >
          {text.send}
        </Button>
      </div>
      <ActionMessage state={state} />
    </form>
  );
}

/** « Reprendre Numa » : seul un vétérinaire rend la main à l'assistante. */
export function ResumeNumaButton({ followupId }: { followupId: string }) {
  const [state, action, pending] = useActionState(
    resumeNumaAction,
    initialActionState,
  );
  const t = useAppText();
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="followupId" value={followupId} />
      <Button
        type="submit"
        size="sm"
        disabled={pending}
        aria-busy={pending}
        icon={<CirclePlay aria-hidden="true" className="size-4" />}
      >
        {t.dossier.conversation.resumeNuma}
      </Button>
      <ActionMessage state={state} />
    </form>
  );
}

/**
 * Correction par un vétérinaire de la langue dans laquelle Numa écrit à un propriétaire
 * (lot 19). Le serveur revérifie le droit ; le choix prime ensuite sur la détection.
 */
export function OwnerLanguageForm({
  followupId,
  role,
  firstName,
  language,
}: {
  followupId: string;
  role: "primary" | "secondary";
  firstName: string;
  language: "fr" | "en";
}) {
  const [state, action, pending] = useActionState(
    setOwnerLanguageAction,
    initialActionState,
  );
  const id = useId();
  const t = useAppText();
  const text = t.dossier.contacts.languageForm;
  return (
    <form action={action} className="mt-2 grid gap-1.5">
      <input type="hidden" name="followupId" value={followupId} />
      <input type="hidden" name="role" value={role} />
      <label htmlFor={id} className="text-sm font-semibold">
        {text.label(firstName)}
      </label>
      <p id={`${id}-aide`} className="text-xs text-ink-muted">
        {text.help}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select
          id={id}
          name="language"
          defaultValue={language}
          aria-describedby={`${id}-aide`}
          className={selectClasses}
        >
          <option value="fr">{t.labels.languages.fr}</option>
          <option value="en">{t.labels.languages.en}</option>
        </select>
        <Button
          type="submit"
          variant="secondary"
          className="h-11"
          disabled={pending}
          aria-busy={pending}
          icon={<Languages aria-hidden="true" className="size-4" />}
        >
          {text.submit}
        </Button>
      </div>
      <ActionMessage state={state} />
    </form>
  );
}
