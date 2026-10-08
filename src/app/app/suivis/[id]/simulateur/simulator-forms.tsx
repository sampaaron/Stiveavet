"use client";

import { FastForward, Send } from "lucide-react";
import { useActionState, useId } from "react";

import { Button } from "@/ui/button";

import { ActionMessage } from "../../../action-message";
import { initialActionState } from "../../../action-state";
import {
  runDueNowAction,
  simulateOwnerAction,
} from "../../conversation-actions";

const QUICK_REPLIES = ["OUI", "STOP", "REPRENDRE"] as const;

/** Ce que le propriétaire écrit depuis « son » WhatsApp (simulé). */
export function OwnerSimulatorForm({
  followupId,
  ownerFirstName,
}: {
  followupId: string;
  ownerFirstName: string;
}) {
  const [state, action, pending] = useActionState(
    simulateOwnerAction,
    initialActionState,
  );
  const id = useId();

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2" aria-label="Réponses rapides">
        {QUICK_REPLIES.map((reply) => (
          <form key={reply} action={action}>
            <input type="hidden" name="followupId" value={followupId} />
            <input type="hidden" name="body" value={reply} />
            <Button
              type="submit"
              size="sm"
              variant="secondary"
              disabled={pending}
            >
              {reply}
            </Button>
          </form>
        ))}
      </div>
      <form action={action} className="grid gap-2">
        <input type="hidden" name="followupId" value={followupId} />
        <label htmlFor={id} className="text-sm font-semibold">
          Message de {ownerFirstName}
        </label>
        <div className="flex items-end gap-2">
          <textarea
            id={id}
            name="body"
            rows={2}
            maxLength={4096}
            className="min-h-11 min-w-0 flex-1 resize-y rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2 text-[15px] placeholder:text-ink-muted"
            placeholder="Écrire comme le propriétaire"
          />
          <Button
            type="submit"
            disabled={pending}
            aria-busy={pending}
            aria-label="Envoyer en tant que propriétaire"
            icon={<Send aria-hidden="true" className="size-4" />}
          />
        </div>
      </form>
      <ActionMessage state={state} />
    </div>
  );
}

/** Faire passer le temps : les envois prévus de ce suivi partent tout de suite. */
export function RunDueNowForm({ followupId }: { followupId: string }) {
  const [state, action, pending] = useActionState(
    runDueNowAction,
    initialActionState,
  );
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="followupId" value={followupId} />
      <Button
        type="submit"
        size="sm"
        variant="secondary"
        disabled={pending}
        aria-busy={pending}
        icon={<FastForward aria-hidden="true" className="size-4" />}
      >
        Avancer jusqu&apos;aux envois prévus
      </Button>
      <ActionMessage state={state} />
    </form>
  );
}
