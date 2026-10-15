"use client";

import { useActionState } from "react";

import { useAppText } from "@/i18n/app/client";
import { Button } from "@/ui/button";
import { TextField } from "@/ui/text-field";

import { ActionMessage } from "../action-message";
import { initialActionState } from "../action-state";

import { alertPhoneAction } from "./actions";

/** Saisie du numéro d'alerte : le numéro enregistré n'est jamais réaffiché en entier. */
export function AlertPhoneForm() {
  const t = useAppText();
  const text = t.alerts.phone;
  const [state, action, pending] = useActionState(
    alertPhoneAction,
    initialActionState,
  );
  return (
    <form action={action} className="grid gap-3" noValidate>
      <TextField
        label={text.label}
        name="phone"
        type="tel"
        autoComplete="tel"
        maxLength={30}
        hint={text.hint}
        className="max-w-sm"
      />
      <ActionMessage state={state} />
      <div>
        <Button
          type="submit"
          variant="secondary"
          disabled={pending}
          aria-busy={pending}
        >
          {text.submit}
        </Button>
      </div>
    </form>
  );
}
