"use client";

import Link from "next/link";
import { useActionState } from "react";

import { AlertBanner } from "@/ui/alert-banner";
import { Button } from "@/ui/button";
import { TextField } from "@/ui/text-field";

import {
  acceptInvitationAction,
  loginAction,
  requestResetAction,
  resetPasswordAction,
  signupAction,
  unlockAction,
  verifyCodeAction,
} from "./actions";
import { initialFormState } from "./form-state";
import type { FormState } from "./form-state";

const PASSWORD_HINT =
  "12 caractères minimum. Une phrase facile à retenir fonctionne très bien.";

function Messages({ state }: { state: FormState }) {
  if (state.error) return <AlertBanner tone="urgent" title={state.error} />;
  if (state.notice) return <AlertBanner tone="success" title={state.notice} />;
  return null;
}

function Submit({ pending, children }: { pending: boolean; children: string }) {
  return (
    <Button
      type="submit"
      className="w-full"
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? "Patientez…" : children}
    </Button>
  );
}

export function LoginForm() {
  const [state, action, pending] = useActionState(
    loginAction,
    initialFormState,
  );
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Messages state={state} />
      <TextField
        label="Adresse e-mail"
        name="email"
        type="email"
        autoComplete="username"
        required
        defaultValue={state.values?.email}
        errors={state.fieldErrors?.email}
      />
      <TextField
        label="Mot de passe"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        errors={state.fieldErrors?.password}
      />
      <Submit pending={pending}>Se connecter</Submit>
      <p className="text-center text-sm">
        <Link
          href="/mot-de-passe-oublie"
          className="font-semibold text-brand-ink underline-offset-2 hover:underline"
        >
          Mot de passe oublié ?
        </Link>
      </p>
    </form>
  );
}

export function CodeForm() {
  const [state, action, pending] = useActionState(
    verifyCodeAction,
    initialFormState,
  );
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Messages state={state} />
      <TextField
        label="Code de sécurité"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={7}
        required
        hint="6 chiffres, valable 10 minutes."
        errors={state.fieldErrors?.code}
      />
      <Submit pending={pending}>Valider le code</Submit>
      <p className="text-center text-sm">
        <Link
          href="/connexion"
          className="font-semibold text-brand-ink underline-offset-2 hover:underline"
        >
          Recevoir un nouveau code
        </Link>
      </p>
    </form>
  );
}

export function UnlockForm() {
  const [state, action, pending] = useActionState(
    unlockAction,
    initialFormState,
  );
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Messages state={state} />
      <TextField
        label="Mot de passe"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        autoFocus
        errors={state.fieldErrors?.password}
      />
      <Submit pending={pending}>Déverrouiller</Submit>
    </form>
  );
}

export function ResetRequestForm() {
  const [state, action, pending] = useActionState(
    requestResetAction,
    initialFormState,
  );
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Messages state={state} />
      <TextField
        label="Adresse e-mail"
        name="email"
        type="email"
        autoComplete="username"
        required
        defaultValue={state.values?.email}
        errors={state.fieldErrors?.email}
      />
      <Submit pending={pending}>Recevoir un lien</Submit>
    </form>
  );
}

export function NewPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(
    resetPasswordAction,
    initialFormState,
  );
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Messages state={state} />
      <input type="hidden" name="token" value={token} />
      <TextField
        label="Nouveau mot de passe"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        hint={PASSWORD_HINT}
        errors={state.fieldErrors?.password}
      />
      <TextField
        label="Confirmer le mot de passe"
        name="confirmation"
        type="password"
        autoComplete="new-password"
        required
        errors={state.fieldErrors?.confirmation}
      />
      <Submit pending={pending}>Enregistrer le mot de passe</Submit>
    </form>
  );
}

export function SignupForm() {
  const [state, action, pending] = useActionState(
    signupAction,
    initialFormState,
  );
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Messages state={state} />
      <TextField
        label="Nom du cabinet"
        name="organizationName"
        autoComplete="organization"
        required
        defaultValue={state.values?.organizationName}
        errors={state.fieldErrors?.organizationName}
      />
      <TextField
        label="Votre nom"
        name="displayName"
        autoComplete="name"
        required
        hint="Tel qu'il apparaîtra à votre équipe, par exemple « Dr Claire Fontaine »."
        defaultValue={state.values?.displayName}
        errors={state.fieldErrors?.displayName}
      />
      <TextField
        label="Adresse e-mail professionnelle"
        name="email"
        type="email"
        autoComplete="username"
        required
        defaultValue={state.values?.email}
        errors={state.fieldErrors?.email}
      />
      <TextField
        label="Mot de passe"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        hint={PASSWORD_HINT}
        errors={state.fieldErrors?.password}
      />
      <TextField
        label="Confirmer le mot de passe"
        name="confirmation"
        type="password"
        autoComplete="new-password"
        required
        errors={state.fieldErrors?.confirmation}
      />
      <Submit pending={pending}>Créer le cabinet</Submit>
    </form>
  );
}

export function InvitationForm({
  token,
  email,
  displayName,
}: {
  token: string;
  email: string;
  displayName: string;
}) {
  const [state, action, pending] = useActionState(
    acceptInvitationAction,
    initialFormState,
  );
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Messages state={state} />
      <input type="hidden" name="token" value={token} />
      <TextField
        label="Adresse e-mail"
        name="email"
        type="email"
        autoComplete="username"
        value={email}
        readOnly
        hint="L'adresse à laquelle l'invitation a été envoyée."
      />
      <TextField
        label="Votre nom"
        name="displayName"
        autoComplete="name"
        required
        defaultValue={state.values?.displayName ?? displayName}
        errors={state.fieldErrors?.displayName}
      />
      <TextField
        label="Mot de passe"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        hint={PASSWORD_HINT}
        errors={state.fieldErrors?.password}
      />
      <TextField
        label="Confirmer le mot de passe"
        name="confirmation"
        type="password"
        autoComplete="new-password"
        required
        errors={state.fieldErrors?.confirmation}
      />
      <Submit pending={pending}>Créer mon compte</Submit>
    </form>
  );
}
