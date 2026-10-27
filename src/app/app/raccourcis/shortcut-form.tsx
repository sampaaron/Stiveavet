"use client";

import { Sparkles } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/ui/button";

import { ActionMessage } from "../action-message";
import { initialActionState } from "../action-state";
import { askStiveAction } from "../stive/actions";

/** Un raccourci : envoie sa demande à Stive, dont la réponse s'ouvre dans la conversation. */
export function ShortcutForm({
  question,
  submit,
  label,
}: {
  question: string;
  submit: string;
  /** Nom accessible du bouton, avec le titre du raccourci. */
  label: string;
}) {
  const [state, action, pending] = useActionState(
    askStiveAction,
    initialActionState,
  );
  return (
    <form action={action} className="mt-auto grid gap-2">
      <input type="hidden" name="question" value={question} />
      <div>
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          disabled={pending}
          aria-busy={pending}
          aria-label={label}
          icon={<Sparkles aria-hidden="true" className="size-4" />}
        >
          {submit}
        </Button>
      </div>
      <ActionMessage state={state} />
    </form>
  );
}
