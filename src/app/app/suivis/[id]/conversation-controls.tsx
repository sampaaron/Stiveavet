"use client";

import { CirclePlay, Send } from "lucide-react";
import { useActionState, useId } from "react";

import { Button } from "@/ui/button";

import { ActionMessage } from "../../action-message";
import { initialActionState } from "../../action-state";
import { resumeNumaAction, writeToOwnerAction } from "../conversation-actions";

const MAX_BODY = 4096;

/** Message de l'équipe au propriétaire ; le serveur revalide tout (droit, accord, état). */
export function OwnerComposer({
  followupId,
  ownerFirstName,
  animalName,
  pausesNuma,
}: {
  followupId: string;
  ownerFirstName: string;
  animalName: string;
  /** Numa est active : écrire la met en pause. */
  pausesNuma: boolean;
}) {
  const [state, action, pending] = useActionState(
    writeToOwnerAction,
    initialActionState,
  );
  const id = useId();

  return (
    <form
      action={action}
      className="grid gap-2 border-t border-line p-4 sm:p-5"
    >
      <input type="hidden" name="followupId" value={followupId} />
      <label htmlFor={id} className="text-sm font-semibold">
        Écrire à {ownerFirstName}
      </label>
      <p id={`${id}-aide`} className="text-xs text-ink-muted">
        Le message part du WhatsApp professionnel du cabinet.{" "}
        {pausesNuma
          ? "Numa se met en pause dès que vous écrivez, jusqu'à « Reprendre Numa »."
          : "Numa reste en pause."}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <textarea
          id={id}
          name="body"
          rows={2}
          maxLength={MAX_BODY}
          aria-describedby={`${id}-aide`}
          className="min-h-11 min-w-0 flex-1 resize-y rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2 text-[15px] placeholder:text-ink-muted"
          placeholder={`Votre message au sujet de ${animalName}`}
        />
        <Button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          icon={<Send aria-hidden="true" className="size-4" />}
        >
          Envoyer
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
        Reprendre Numa
      </Button>
      <ActionMessage state={state} />
    </form>
  );
}
