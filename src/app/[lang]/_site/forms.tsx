"use client";

import Link from "next/link";
import { useActionState, useId } from "react";

import type { Locale } from "@/i18n/locales";
import { pathFor } from "@/i18n/routes";
import type { SiteDictionary } from "@/i18n/site";
import { AlertBanner } from "@/ui/alert-banner";
import { Button } from "@/ui/button";
import { TextField } from "@/ui/text-field";

import { demoRequestAction, unsubscribeAction } from "./actions";
import type {
  DemoErrorCode,
  DemoFormState,
  UnsubscribeState,
} from "./form-states";

type DemoCopy = SiteDictionary["demo"];

function message(
  copy: DemoCopy,
  code: string | undefined,
): string[] | undefined {
  if (!code) return undefined;
  const known = code in copy.errors ? (code as DemoErrorCode) : "email";
  return [copy.errors[known]];
}

export function DemoForm({
  locale,
  copy,
  expired,
}: {
  locale: Locale;
  copy: DemoCopy;
  expired: boolean;
}) {
  const [state, action, pending] = useActionState<DemoFormState, FormData>(
    demoRequestAction,
    {},
  );
  const vetsId = useId();
  const vetsError = message(copy, state.fieldErrors?.vetCount);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? (
        <AlertBanner tone="urgent" title={copy.errors.rate_limited} />
      ) : expired ? (
        <AlertBanner tone="watch" title={copy.errors.expired} />
      ) : null}
      <input type="hidden" name="locale" value={locale} />
      <TextField
        label={copy.form.email}
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.values?.email}
        errors={message(copy, state.fieldErrors?.email)}
      />
      <TextField
        label={copy.form.cabinet}
        name="cabinetName"
        autoComplete="organization"
        required
        defaultValue={state.values?.cabinetName}
        errors={message(copy, state.fieldErrors?.cabinetName)}
      />
      <fieldset
        className="grid gap-2"
        aria-describedby={vetsError ? `${vetsId}-erreur` : undefined}
      >
        <legend className="mb-1.5 text-sm font-semibold">
          {copy.form.vets}
        </legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(["1", "2", "3", "4"] as const).map((value) => (
            <label
              key={value}
              className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-control)] border border-line text-sm font-semibold has-[:checked]:border-brand has-[:checked]:bg-brand-soft has-[:checked]:text-brand-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand"
            >
              <input
                type="radio"
                name="vetCount"
                value={value}
                required
                defaultChecked={state.values?.vetCount === value}
                className="sr-only"
              />
              {copy.form.vetOptions[value]}
            </label>
          ))}
        </div>
        {vetsError ? (
          <p
            id={`${vetsId}-erreur`}
            className="text-[13px] font-medium text-urgent"
          >
            {vetsError[0]}
          </p>
        ) : null}
      </fieldset>
      <p className="text-[13px] text-ink-muted">
        {copy.form.notice}{" "}
        <Link
          href={pathFor("privacy", locale)}
          className="font-semibold text-brand-ink underline underline-offset-2"
        >
          {copy.form.privacyLink}
        </Link>
      </p>
      <Button
        type="submit"
        className="w-full"
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? copy.form.pending : copy.form.submit}
      </Button>
    </form>
  );
}

export function UnsubscribeForm({
  token,
  copy,
}: {
  token: string;
  copy: SiteDictionary["unsubscribe"];
}) {
  const [state, action, pending] = useActionState<UnsubscribeState, FormData>(
    unsubscribeAction,
    "idle",
  );
  if (state === "done") return <AlertBanner tone="success" title={copy.done} />;
  return (
    <form action={action} className="flex flex-col gap-4">
      {state === "invalid" ? (
        <AlertBanner tone="urgent" title={copy.invalid} />
      ) : null}
      <input type="hidden" name="jeton" value={token} />
      <div>
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {copy.submit}
        </Button>
      </div>
    </form>
  );
}
