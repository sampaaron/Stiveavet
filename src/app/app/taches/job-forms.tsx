"use client";

import { useActionState } from "react";

import { Button } from "@/ui/button";

import { ActionMessage } from "../action-message";
import { initialActionState } from "../action-state";
import { cancelJobAction, retryJobAction } from "./actions";

/** Relancer ou abandonner une tâche en échec. */
export function JobActions({ id, label }: { id: string; label: string }) {
  const [retryState, retry, retrying] = useActionState(
    retryJobAction,
    initialActionState,
  );
  const [cancelState, cancel, cancelling] = useActionState(
    cancelJobAction,
    initialActionState,
  );
  const pending = retrying || cancelling;
  return (
    <div className="grid gap-2 sm:justify-items-end">
      <div className="flex flex-wrap gap-2">
        <form action={retry}>
          <input type="hidden" name="id" value={id} />
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            disabled={pending}
            aria-busy={retrying}
            aria-label={`Relancer : ${label}`}
          >
            Relancer
          </Button>
        </form>
        <form action={cancel}>
          <input type="hidden" name="id" value={id} />
          <Button
            type="submit"
            variant="quiet"
            size="sm"
            disabled={pending}
            aria-busy={cancelling}
            aria-label={`Abandonner : ${label}`}
          >
            Abandonner
          </Button>
        </form>
      </div>
      <ActionMessage state={retryState.error ? retryState : cancelState} />
    </div>
  );
}
