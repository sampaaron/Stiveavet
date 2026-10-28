"use client";

import { startRegistration } from "@simplewebauthn/browser";
import { KeyRound } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import type { FormEvent } from "react";

import { useAppText } from "@/i18n/app/client";
import { AlertBanner } from "@/ui/alert-banner";
import { Button } from "@/ui/button";
import { TextField } from "@/ui/text-field";
import { useWebAuthnSupport } from "@/ui/webauthn";

import { initialFormState } from "../../(auth)/form-state";
import type { FormState } from "../../(auth)/form-state";
import { ActionMessage } from "../action-message";
import { initialActionState } from "../action-state";

import {
  changePasswordAction,
  finishPasskeyAction,
  removePasskeyAction,
  revokeDeviceAction,
  revokeOtherSessionsAction,
  startPasskeyAction,
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

/**
 * Ajout d'une clé d'accès (ADR 0050) : nom et mot de passe, puis l'appareil crée la clé
 * (empreinte, visage ou code) et le serveur vérifie sa réponse avant de l'enregistrer.
 */
export function AddPasskeyForm() {
  const t = useAppText();
  const text = t.account.passkeys;
  const supported = useWebAuthnSupport();
  const [state, setState] = useState<FormState>(initialFormState);
  const [pending, startTransition] = useTransition();
  if (!supported)
    return <p className="text-sm text-ink-muted">{text.unsupported}</p>;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = event.currentTarget;
    const form = new FormData(target);
    startTransition(async () => {
      const started = await startPasskeyAction(form);
      if (!started.options) return setState(started);
      const response = await startRegistration({
        optionsJSON: started.options,
      }).catch((error: unknown) =>
        error instanceof Error && error.name === "InvalidStateError"
          ? text.already
          : text.cancelled,
      );
      if (typeof response === "string") return setState({ error: response });
      const finished = await finishPasskeyAction(
        String(form.get("label") ?? ""),
        JSON.stringify(response),
      );
      setState(finished);
      if (finished.notice) target.reset();
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      {state.error ? <AlertBanner tone="urgent" title={state.error} /> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <TextField
          label={text.label}
          name="label"
          required
          maxLength={60}
          autoComplete="off"
          hint={text.labelHint}
          errors={state.fieldErrors?.label}
        />
        <TextField
          label={text.password}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          errors={state.fieldErrors?.password}
        />
      </div>
      {state.notice ? (
        <p role="status" className="text-sm font-medium text-brand-ink">
          {state.notice}
        </p>
      ) : null}
      <div>
        <Button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          icon={<KeyRound aria-hidden="true" className="size-4" />}
        >
          {text.submit}
        </Button>
      </div>
    </form>
  );
}

export function RemovePasskeyForm({
  id,
  label,
}: {
  id: string;
  label: string;
}) {
  const t = useAppText();
  const [state, action, pending] = useActionState(
    removePasskeyAction,
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
        aria-label={t.account.passkeys.removeLabel(label)}
      >
        {t.account.passkeys.remove}
      </Button>
      <ActionMessage state={state} />
    </form>
  );
}
