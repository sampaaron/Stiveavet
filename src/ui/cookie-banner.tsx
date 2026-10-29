import { Cookie } from "lucide-react";
import Link from "next/link";

import { consentText } from "@/i18n/consent";
import type { Locale } from "@/i18n/locales";
import { pathFor } from "@/i18n/routes";

import { ConsentForm } from "./consent-form";

/**
 * Bandeau de cookies (ADR 0053), à la première visite puis tous les six mois. Aux couleurs
 * du site (nuit verte) quel que soit l'écran, sans bloquer la page : la personne peut le
 * laisser et continuer, seuls les cookies nécessaires sont alors déposés.
 */
export function CookieBanner({ locale }: { locale: Locale }) {
  const text = consentText(locale);
  return (
    <section
      aria-labelledby="bandeau-cookies"
      className="theme-site fixed inset-x-3 bottom-3 z-50 max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-[var(--radius-card)] border border-line bg-surface p-5 text-ink shadow-[0_30px_80px_-20px_rgb(0_0_0/0.8)] sm:inset-x-auto sm:left-4 sm:w-[26rem]"
    >
      <div className="mb-3 flex items-center gap-3">
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft text-brand-ink"
        >
          <Cookie className="size-[18px]" />
        </span>
        <h2 id="bandeau-cookies" className="font-bold tracking-tight">
          {text.banner.title}
        </h2>
      </div>
      <p className="mb-4 text-sm text-ink-muted">{text.banner.body}</p>
      <ConsentForm locale={locale} current={null} idPrefix="bandeau" />
      <p className="mt-2 text-center text-xs">
        <Link
          href={pathFor("cookies", locale)}
          className="text-ink-muted underline underline-offset-2 hover:text-ink"
        >
          {text.banner.learnMore}
        </Link>
      </p>
    </section>
  );
}
