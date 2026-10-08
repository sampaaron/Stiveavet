"use client";

import Link from "next/link";
import { useActionState, useId } from "react";

import {
  PLANS,
  PLAN_CATALOG,
  TRIAL_MONTHLY_CENTS,
  TRIAL_MONTHS,
} from "@/domains/facturation/rules";
import { useAppText, useLocale } from "@/i18n/app/client";
import { pathFor } from "@/i18n/routes";
import { AlertBanner } from "@/ui/alert-banner";
import { Button } from "@/ui/button";
import { formatEuros } from "@/ui/format";
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

function Messages({ state }: { state: FormState }) {
  if (state.error) return <AlertBanner tone="urgent" title={state.error} />;
  if (state.notice) return <AlertBanner tone="success" title={state.notice} />;
  return null;
}

function Submit({ pending, children }: { pending: boolean; children: string }) {
  const t = useAppText().auth;
  return (
    <Button
      type="submit"
      className="w-full"
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? t.pending : children}
    </Button>
  );
}

export function LoginForm() {
  const t = useAppText().auth;
  const [state, action, pending] = useActionState(
    loginAction,
    initialFormState,
  );
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Messages state={state} />
      <TextField
        label={t.fields.email}
        name="email"
        type="email"
        autoComplete="username"
        required
        defaultValue={state.values?.email}
        errors={state.fieldErrors?.email}
      />
      <TextField
        label={t.fields.password}
        name="password"
        type="password"
        autoComplete="current-password"
        required
        errors={state.fieldErrors?.password}
      />
      <Submit pending={pending}>{t.login.submit}</Submit>
      <p className="text-center text-sm">
        <Link
          href="/mot-de-passe-oublie"
          className="font-semibold text-brand-ink underline-offset-2 hover:underline"
        >
          {t.login.forgotPassword}
        </Link>
      </p>
    </form>
  );
}

export function CodeForm({ afterSignup = false }: { afterSignup?: boolean }) {
  const t = useAppText().auth;
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
        label={t.fields.code}
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={7}
        required
        hint={t.fields.codeHint}
        errors={state.fieldErrors?.code}
      />
      <Submit pending={pending}>{t.code.submit}</Submit>
      <p className="text-center text-sm">
        <Link
          href="/connexion"
          className="font-semibold text-brand-ink underline-offset-2 hover:underline"
        >
          {t.code.resend}
        </Link>
      </p>
    </form>
  );
}

export function UnlockForm() {
  const t = useAppText().auth;
  const [state, action, pending] = useActionState(
    unlockAction,
    initialFormState,
  );
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Messages state={state} />
      <TextField
        label={t.fields.password}
        name="password"
        type="password"
        autoComplete="current-password"
        required
        autoFocus
        errors={state.fieldErrors?.password}
      />
      <Submit pending={pending}>{t.lock.submit}</Submit>
    </form>
  );
}

export function ResetRequestForm() {
  const t = useAppText().auth;
  const [state, action, pending] = useActionState(
    requestResetAction,
    initialFormState,
  );
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Messages state={state} />
      <TextField
        label={t.fields.email}
        name="email"
        type="email"
        autoComplete="username"
        required
        defaultValue={state.values?.email}
        errors={state.fieldErrors?.email}
      />
      <Submit pending={pending}>{t.forgot.submit}</Submit>
    </form>
  );
}

export function NewPasswordForm({ token }: { token: string }) {
  const t = useAppText().auth;
  const [state, action, pending] = useActionState(
    resetPasswordAction,
    initialFormState,
  );
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Messages state={state} />
      <input type="hidden" name="token" value={token} />
      <TextField
        label={t.fields.newPassword}
        name="password"
        type="password"
        autoComplete="new-password"
        required
        hint={t.passwordHint}
        errors={state.fieldErrors?.password}
      />
      <TextField
        label={t.fields.confirmPassword}
        name="confirmation"
        type="password"
        autoComplete="new-password"
        required
        errors={state.fieldErrors?.confirmation}
      />
      <Submit pending={pending}>{t.reset.submit}</Submit>
    </form>
  );
}

export function SignupForm() {
  const t = useAppText().auth;
  const [state, action, pending] = useActionState(
    signupAction,
    initialFormState,
  );
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Messages state={state} />
      <TextField
        label={t.fields.organizationName}
        name="organizationName"
        autoComplete="organization"
        required
        defaultValue={state.values?.organizationName}
        errors={state.fieldErrors?.organizationName}
      />
      <TextField
        label={t.fields.displayName}
        name="displayName"
        autoComplete="name"
        required
        hint={t.fields.displayNameHint}
        defaultValue={state.values?.displayName}
        errors={state.fieldErrors?.displayName}
      />
      <TextField
        label={t.fields.workEmail}
        name="email"
        type="email"
        autoComplete="username"
        required
        defaultValue={state.values?.email}
        errors={state.fieldErrors?.email}
      />
      <PlanChoice value={state.values?.plan} errors={state.fieldErrors?.plan} />
      <TextField
        label={t.fields.password}
        name="password"
        type="password"
        autoComplete="new-password"
        required
        hint={t.passwordHint}
        errors={state.fieldErrors?.password}
      />
      <TextField
        label={t.fields.confirmPassword}
        name="confirmation"
        type="password"
        autoComplete="new-password"
        required
        errors={state.fieldErrors?.confirmation}
      />
      <Consents values={state.values} errors={state.fieldErrors} />
      <Submit pending={pending}>{t.signup.submit}</Submit>
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
  const t = useAppText().auth;
  const [state, action, pending] = useActionState(
    acceptInvitationAction,
    initialFormState,
  );
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Messages state={state} />
      <input type="hidden" name="token" value={token} />
      <TextField
        label={t.fields.email}
        name="email"
        type="email"
        autoComplete="username"
        value={email}
        readOnly
        hint={t.fields.invitationEmailHint}
      />
      <TextField
        label={t.fields.displayName}
        name="displayName"
        autoComplete="name"
        required
        defaultValue={state.values?.displayName ?? displayName}
        errors={state.fieldErrors?.displayName}
      />
      <TextField
        label={t.fields.password}
        name="password"
        type="password"
        autoComplete="new-password"
        required
        hint={t.passwordHint}
        errors={state.fieldErrors?.password}
      />
      <TextField
        label={t.fields.confirmPassword}
        name="confirmation"
        type="password"
        autoComplete="new-password"
        required
        errors={state.fieldErrors?.confirmation}
      />
      <Submit pending={pending}>{t.invitation.submit}</Submit>
    </form>
  );
}

/** Acceptation des conditions et pouvoir de souscrire : deux cases distinctes, jamais pré-cochées. */
function Consents({
  values,
  errors,
}: {
  values: FormState["values"];
  errors: FormState["fieldErrors"];
}) {
  const id = useId();
  const t = useAppText().auth.signup.consents;
  const locale = useLocale();
  const boxes = [
    {
      name: "acceptTerms",
      label: (
        <>
          {t.termsBefore}
          <Link
            href={pathFor("terms", locale)}
            target="_blank"
            className="font-semibold text-brand-ink underline underline-offset-2"
          >
            {t.termsLink}
          </Link>
          {t.termsMiddle}
          <Link
            href={pathFor("privacy", locale)}
            target="_blank"
            className="font-semibold text-brand-ink underline underline-offset-2"
          >
            {t.privacyLink}
          </Link>
          {t.termsAfter}
        </>
      ),
    },
    {
      name: "authorized",
      label: <>{t.authorized}</>,
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

/** Formule appliquée après les 2 mois d'essai pilote ; modifiable ensuite dans Facturation. */
function PlanChoice({
  value,
  errors,
}: {
  value?: string;
  errors?: readonly string[];
}) {
  const id = useId();
  const text = useAppText();
  const t = text.auth.signup.plan;
  const locale = useLocale();
  return (
    <fieldset
      className="grid gap-2"
      aria-describedby={`${id}-aide${errors?.length ? ` ${id}-erreur` : ""}`}
    >
      <legend className="mb-1 text-sm font-semibold">{t.legend}</legend>
      <p id={`${id}-aide`} className="text-[13px] text-ink-muted">
        {t.help(formatEuros(TRIAL_MONTHLY_CENTS, locale), TRIAL_MONTHS)}
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
                {t.option(
                  text.labels.plans[plan].name,
                  formatEuros(definition.monthlyCents, locale),
                )}
              </span>
              <span className="block text-ink-muted">
                {t.details(
                  definition.maxVets,
                  formatEuros(definition.annualMonthlyCents, locale),
                )}
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
