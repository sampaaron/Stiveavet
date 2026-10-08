"use client";

import { useActionState } from "react";

import { Button } from "@/ui/button";

import { ActionMessage } from "../../action-message";
import { initialActionState } from "../../action-state";
import { prepareFollowupAction } from "../launch-actions";

/** Importe l'animal depuis dr.veto et ouvre sa fiche de lancement. */
export function PrepareForm({
  drVetoRef,
  animalName,
}: {
  drVetoRef: string;
  animalName: string;
}) {
  const [state, action, pending] = useActionState(
    prepareFollowupAction,
    initialActionState,
  );
  return (
    <form action={action} className="grid gap-2 sm:justify-items-end">
      <input type="hidden" name="ref" value={drVetoRef} />
      <Button
        type="submit"
        size="sm"
        disabled={pending}
        aria-busy={pending}
        aria-label={`Préparer la fiche de ${animalName}`}
      >
        Préparer la fiche
      </Button>
      <ActionMessage state={state} />
    </form>
  );
}
