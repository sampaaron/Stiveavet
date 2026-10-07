"use client";

import Link from "next/link";
import { useActionState, useId } from "react";

import {
  PLANS,
  PLAN_CATALOG,
  TRIAL_MONTHLY_CENTS,
  TRIAL_MONTHS,
  formatEuros,
} from "@/domains/facturation/rules";
import { pathFor } from "@/i18n/routes";
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

export function CodeForm({ afterSignup = false }: { afterSignup?: boolean }) {
  const [state, action, pending] = useActionState(
    verifyCodeAction,
    initialFormState,
  );
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Messages state={state} />
      {afterSignup ? (
        <input type="hidden" name="origine" value="inscription" />
      ) : null}
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
      <PlanChoice value={state.values?.plan} errors={state.fieldErrors?.plan} />
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
      <Consents values={state.values} errors={state.fieldErrors} />
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

/** Formule appliquée après les 2 mois d'essai pilote ; modifiable ensuite dans Facturation. */
/** Acceptation des conditions et pouvoir de souscrire : deux cases distinctes, jamais pré-cochées. */
function Consents({
  values,
  errors,
}: {
  values: FormState["values"];
  errors: FormState["fieldErrors"];
}) {
  const id = useId();
  const boxes = [
    {
      name: "acceptTerms",
      label: (
        <>
          J&apos;accepte les{" "}
          <Link
            href={pathFor("terms", "fr")}
            target="_blank"
            className="font-semibold text-brand-ink underline underline-offset-2"
          >
            conditions d&apos;utilisation
          </Link>{" "}
          et j&apos;ai lu la{" "}
          <Link
            href={pathFor("privacy", "fr")}
            target="_blank"
            className="font-semibold text-brand-ink underline underline-offset-2"
          >
            politique de confidentialité
          </Link>
          .
        </>
      ),
    },
    {
      name: "authorized",
      label: <>Je confirme être autorisé à souscrire au nom de ce cabinet.</>,
    },
  ] as const;
  return (
    <div className="grid gap-3">
      {boxes.map((box) => {
        const boxErrors = errors?.[box.name];
        const errorId = `${id}-${box.name}-erreur`;
        return (
          <div key={box.name} className="grid gap-1">
            <label className="flex items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                name={box.name}
                required
                defaultChecked={values?.[box.name] === "on"}
                aria-invalid={boxErrors?.length ? true : undefined}
                aria-describedby={boxErrors?.length ? errorId : undefined}
                className="mt-0.5 size-4 shrink-0 accent-[var(--color-brand)]"
              />
              <span>{box.label}</span>
            </label>
            {boxErrors?.length ? (
              <p id={errorId} className="text-[13px] font-medium text-urgent">
                {boxErrors[0]}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function PlanChoice({
  value,
  errors,
}: {
  value?: string;
  errors?: readonly string[];
}) {
  const id = useId();
  return (
    <fieldset
      className="grid gap-2"
      aria-describedby={`${id}-aide${errors?.length ? ` ${id}-erreur` : ""}`}
    >
      <legend className="mb-1 text-sm font-semibold">
        Formule après l&apos;essai
      </legend>
      <p id={`${id}-aide`} className="text-[13px] text-ink-muted">
        Essai pilote à {formatEuros(TRIAL_MONTHLY_CENTS)} HT par mois pendant{" "}
        {TRIAL_MONTHS} mois, sans engagement. Ensuite, la formule choisie, au
        mois : l&apos;engagement annuel n&apos;est jamais automatique.
      </p>
      {PLANS.map((plan) => {
        const definition = PLAN_CATALOG[plan];
        return (
          <label
            key={plan}
            className="flex items-start gap-2.5 rounded-[var(--radius-control)] border border-line p-3 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-soft"
          >
            <input
              type="radio"
              name="plan"
              value={plan}
              defaultChecked={(value ?? "clinic") === plan}
              className="mt-0.5 size-4 shrink-0 accent-[var(--color-brand)]"
            />
            <span>
              <span className="block font-semibold">
                {definition.label} · {formatEuros(definition.monthlyCents)} HT
                par mois
              </span>
              <span className="block text-ink-muted">
                {definition.maxVets === 1
                  ? "1 vétérinaire"
                  : `Jusqu'à ${definition.maxVets} vétérinaires`}
                . Avec engagement annuel :{" "}
                {formatEuros(definition.annualMonthlyCents)} HT par mois.
              </span>
            </span>
          </label>
        );
      })}
      {errors?.length ? (
        <p id={`${id}-erreur`} className="text-[13px] font-medium text-urgent">
          {errors[0]}
        </p>
      ) : null}
    </fieldset>
  );
}
