"use client";

import { useActionState } from "react";

import { useAppText } from "@/i18n/app/client";
import { AlertBanner } from "@/ui/alert-banner";
import { Button } from "@/ui/button";
import { TextField } from "@/ui/text-field";

import { initialFormState } from "../../(auth)/form-state";
import { ActionMessage } from "../action-message";
import { initialActionState } from "../action-state";

import {
  changePasswordAction,
  revokeDeviceAction,
  revokeOtherSessionsAction,
} from "./actions";

export function PasswordForm() {
  const t = useAppText();
  const [state, action, pending] = useActionState(
    changePasswordAction,
    initialFormState,
  );
  return (
    <form action={action} className="grid gap-4" noValidate>
      {state.error ? <AlertBanner tone="urgent" title={state.error} /> : null}
      <TextField
        label={t.account.password.current}
        name="current"
        type="password"
        autoComplete="current-password"
        required
        errors={state.fieldErrors?.current}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <TextField
          label={t.auth.fields.newPassword}
          name="password"
          type="password"
          autoComplete="new-password"
          required
          hint={t.auth.passwordHint}
          errors={state.fieldErrors?.password}
        />
        <TextField
          label={t.auth.fields.confirmPassword}
          name="confirmation"
          type="password"
          autoComplete="new-password"
          required
          errors={state.fieldErrors?.confirmation}
        />
      </div>
      {state.notice ? (
        <p role="status" className="text-sm font-medium text-brand-ink">
          {state.notice}
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {t.account.password.submit}
        </Button>
      </div>
    </form>
  );
}

export function RevokeOtherSessionsForm({ disabled }: { disabled: boolean }) {
  const t = useAppText();
  const [state, action, pending] = useActionState(
    revokeOtherSessionsAction,
    initialActionState,
  );
  return (
    <form action={action} className="grid justify-items-start gap-2">
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        disabled={disabled || pending}
        aria-busy={pending}
      >
        {t.account.sessions.revokeOthers}
      </Button>
      <ActionMessage state={state} />
    </form>
  );
}

export function RevokeDeviceForm({ id, label }: { id: string; label: string }) {
  const t = useAppText();
  const [state, action, pending] = useActionState(
    revokeDeviceAction,
    initialActionState,
  );
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="id" value={id} />
      <Button
        type="submit"
        variant="quiet"
        size="sm"
        disabled={pending}
        aria-label={t.account.devices.revokeLabel(label)}
      >
        {t.account.devices.revoke}
      </Button>
      <ActionMessage state={state} />
    </form>
  );
}
