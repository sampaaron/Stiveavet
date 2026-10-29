import { ChevronDown } from "lucide-react";

import { chooseConsentAction } from "@/app/consent-actions";
import { OPTIONAL_PURPOSES } from "@/domains/consentement/cookies";
import type { Consent } from "@/domains/consentement/cookies";
import { consentText } from "@/i18n/consent";
import type { Locale } from "@/i18n/locales";

import { Button } from "./button";
import { cn } from "./cn";

/**
 * Choix des cookies (ADR 0053), dans le bandeau et sur la politique de cookies. « Tout
 * refuser » et « Tout accepter » ont le même poids ; les finalités facultatives sont
 * décochées tant que la personne ne les a pas acceptées. Fonctionne sans JavaScript.
 */
export function ConsentForm({
  locale,
  current,
  open = false,
  idPrefix,
}: {
  locale: Locale;
  current: Consent | null;
  /** Détail des finalités déplié d'emblée (page de la politique de cookies). */
  open?: boolean;
  idPrefix: string;
}) {
  const text = consentText(locale);
  return (
    <form action={chooseConsentAction} className="grid gap-3">
      <div className="grid grid-cols-2 gap-2">
        <Button type="submit" name="choice" value="none">
          {text.banner.refuseAll}
        </Button>
        <Button type="submit" name="choice" value="all">
          {text.banner.acceptAll}
        </Button>
      </div>
      <details open={open} className="group rounded-[var(--radius-control)]">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-1.5 rounded-full text-sm font-semibold text-brand-ink hover:underline [&::-webkit-details-marker]:hidden">
          {text.banner.customize}
          <ChevronDown
            aria-hidden="true"
            className="size-4 transition-transform group-open:rotate-180"
          />
        </summary>
        <fieldset className="mt-2 grid gap-2">
          <legend className="sr-only">{text.banner.customize}</legend>
          <div className="flex items-start justify-between gap-3 rounded-[var(--radius-control)] border border-line bg-canvas-subtle p-3">
            <span className="min-w-0 text-sm">
              <span className="block font-semibold">
                {text.purposes.necessary.title}
              </span>
              <span className="block text-ink-muted">
                {text.purposes.necessary.body}
              </span>
            </span>
            <span className="shrink-0 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand-ink">
              {text.alwaysOn}
            </span>
          </div>
          {OPTIONAL_PURPOSES.map((purpose) => {
            const id = `${idPrefix}-${purpose}`;
            return (
              <label
                key={purpose}
                htmlFor={id}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-[var(--radius-control)] border border-line bg-canvas-subtle p-3 text-sm",
                )}
              >
                <input
                  id={id}
                  type="checkbox"
                  name={purpose}
                  defaultChecked={current?.[purpose] ?? false}
                  className="mt-0.5 size-4 shrink-0 accent-[var(--color-brand)]"
                />
                <span className="min-w-0">
                  <span className="block font-semibold">
                    {text.purposes[purpose].title}
                  </span>
                  <span className="block text-ink-muted">
                    {text.purposes[purpose].body}
                  </span>
                </span>
              </label>
            );
          })}
          <p className="text-xs text-ink-muted">{text.noToolYet}</p>
          <Button
            type="submit"
            name="choice"
            value="custom"
            variant="secondary"
          >
            {text.banner.save}
          </Button>
        </fieldset>
      </details>
    </form>
  );
}
