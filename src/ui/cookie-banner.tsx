import Link from "next/link";

import { chooseConsentAction } from "@/app/consent-actions";
import { consentText } from "@/i18n/consent";
import type { Locale } from "@/i18n/locales";
import { pathFor } from "@/i18n/routes";

import { Button } from "./button";

/**
 * Bandeau de cookies (ADR 0053), à la première visite puis tous les six mois : une phrase,
 * deux boutons de même poids, et le détail des finalités sur la politique de cookies. Aux
 * couleurs du site quel que soit l'écran, sans bloquer la page.
 */
export function CookieBanner({ locale }: { locale: Locale }) {
  const text = consentText(locale);
  return (
    <section
      aria-label={text.banner.label}
      className="theme-site fixed inset-x-3 bottom-3 z-50 animate-rise-in rounded-[var(--radius-card)] border border-line bg-surface p-4 text-ink shadow-[0_24px_60px_-24px_rgb(0_0_0/0.8)] sm:inset-x-auto sm:left-4 sm:w-[23rem]"
    >
      <p className="text-sm leading-relaxed text-ink-muted">
        <span className="mr-1.5 font-semibold text-ink">
          {text.banner.label}.
        </span>
        {text.banner.body}
      </p>
      <form
        action={chooseConsentAction}
        className="mt-3 flex items-center gap-2"
      >
        <Link
          href={pathFor("cookies", locale)}
          className="mr-auto text-[13px] font-semibold text-brand-ink underline-offset-2 hover:underline"
        >
          {text.banner.customize}
        </Link>
        <Button
          type="submit"
          name="choice"
          value="none"
          variant="secondary"
          size="sm"
        >
          {text.banner.refuse}
        </Button>
        <Button
          type="submit"
          name="choice"
          value="all"
          variant="secondary"
          size="sm"
        >
          {text.banner.accept}
        </Button>
      </form>
    </section>
  );
}
