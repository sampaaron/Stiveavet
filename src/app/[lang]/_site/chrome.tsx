import { Menu } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { TRIAL_MONTHLY_CENTS } from "@/domains/facturation/rules";
import { formatPrice } from "@/i18n/locales";
import type { Locale } from "@/i18n/locales";
import { pathFor } from "@/i18n/routes";
import type { SitePage } from "@/i18n/routes";
import { fill } from "@/i18n/site";
import type { SiteDictionary } from "@/i18n/site";
import { ButtonLink } from "@/ui/button";
import { cn } from "@/ui/cn";

export type SiteProps = { locale: Locale; t: SiteDictionary };

const NAV = [
  "how",
  "numa",
  "stive",
  "integrations",
  "pricing",
  "security",
] as const satisfies readonly SitePage[];

export function trialCta(locale: Locale, t: SiteDictionary): string {
  return fill(t.common.ctaTrial, {
    price: formatPrice(TRIAL_MONTHLY_CENTS, locale),
  });
}

const CTA_TONES = {
  primary: "bg-brand text-white hover:bg-brand-strong",
  onDark: "border border-white/25 text-white hover:bg-white/10",
} as const;

/**
 * Bouton-lien du site public : hauteur minimale de 44 px et texte qui peut passer à la ligne
 * (le libellé « Commencer l'essai à 86 € HT » doit tenir dans 320 px).
 */
export function CtaLink({
  href,
  tone = "primary",
  className,
  children,
}: {
  href: string;
  tone?: keyof typeof CTA_TONES;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] px-4 py-2.5 text-center text-sm font-semibold transition-colors",
        CTA_TONES[tone],
        className,
      )}
    >
      {children}
    </Link>
  );
}

function otherLocale(locale: Locale): Locale {
  return locale === "fr" ? "en" : "fr";
}

function Wordmark() {
  return (
    <span className="text-lg font-bold tracking-tight text-ink">
      stivea <span className="text-brand">vet</span>
    </span>
  );
}

function LanguageLink({
  locale,
  page,
  t,
  className,
}: SiteProps & { page: SitePage; className?: string }) {
  const other = otherLocale(locale);
  return (
    <Link
      href={pathFor(page, other)}
      hrefLang={other}
      lang={other}
      aria-label={t.nav.switchLanguageLabel}
      className={className}
    >
      {t.nav.switchLanguage}
    </Link>
  );
}

const navLink =
  "rounded-[10px] px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-canvas-subtle hover:text-ink aria-[current=page]:text-ink aria-[current=page]:font-semibold";

export function SiteHeader({
  locale,
  t,
  page,
}: SiteProps & { page: SitePage }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
        <Link
          href={pathFor("home", locale)}
          className="flex shrink-0 items-center gap-2.5 rounded-[10px]"
        >
          <Image
            src="/logo-stivea-vet.png"
            alt=""
            width={32}
            height={30}
            className="rounded-lg"
            priority
          />
          <Wordmark />
        </Link>

        <nav aria-label={t.nav.label} className="ml-4 hidden lg:block">
          <ul className="flex items-center gap-0.5">
            {NAV.map((item) => (
              <li key={item}>
                <Link
                  href={pathFor(item, locale)}
                  aria-current={item === page ? "page" : undefined}
                  className={navLink}
                >
                  {t.nav.links[item]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <span className="hidden sm:block">
            <LanguageLink
              locale={locale}
              t={t}
              page={page}
              className={navLink}
            />
          </span>
          <span className="hidden md:block">
            <ButtonLink href="/connexion" variant="quiet">
              {t.common.login}
            </ButtonLink>
          </span>
          <span className="hidden xl:block">
            <ButtonLink href={pathFor("trial", locale)}>
              {trialCta(locale, t)}
            </ButtonLink>
          </span>

          <details className="group relative lg:hidden">
            <summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-[var(--radius-control)] border border-line px-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
              <Menu aria-hidden="true" className="size-4" />
              {t.nav.menu}
            </summary>
            <div className="absolute right-0 z-50 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-[var(--radius-card)] border border-line bg-surface p-2 shadow-[var(--shadow-card)]">
              <nav aria-label={t.nav.menu}>
                <ul className="grid">
                  {NAV.map((item) => (
                    <li key={item}>
                      <Link
                        href={pathFor(item, locale)}
                        aria-current={item === page ? "page" : undefined}
                        className={cn(navLink, "block")}
                      >
                        {t.nav.links[item]}
                      </Link>
                    </li>
                  ))}
                  <li>
                    <Link href="/connexion" className={cn(navLink, "block")}>
                      {t.common.login}
                    </Link>
                  </li>
                  <li>
                    <LanguageLink
                      locale={locale}
                      t={t}
                      page={page}
                      className={cn(navLink, "block")}
                    />
                  </li>
                </ul>
              </nav>
              <CtaLink href={pathFor("trial", locale)} className="mt-2 w-full">
                {trialCta(locale, t)}
              </CtaLink>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}

function FooterColumn({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      <ul className="mt-3 grid gap-2 text-sm">{children}</ul>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        className="text-white/75 underline-offset-2 hover:text-white hover:underline"
      >
        {children}
      </Link>
    </li>
  );
}

export function SiteFooter({
  locale,
  t,
  page,
}: SiteProps & { page: SitePage }) {
  const link = (target: SitePage) => pathFor(target, locale);
  return (
    <footer className="bg-night text-white/75">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="max-w-xs">
          <p className="text-lg font-bold tracking-tight text-white">
            stivea <span className="text-mint">vet</span>
          </p>
          <p className="mt-3 text-sm">{t.footer.tagline}</p>
        </div>
        <FooterColumn title={t.footer.product}>
          {NAV.slice(0, 5).map((item) => (
            <FooterLink key={item} href={link(item)}>
              {t.nav.links[item]}
            </FooterLink>
          ))}
        </FooterColumn>
        <FooterColumn title={t.footer.resources}>
          <FooterLink href={link("demo")}>{t.footer.links.demo}</FooterLink>
          <FooterLink href={link("trial")}>{t.footer.links.trial}</FooterLink>
          <FooterLink href={link("help")}>{t.footer.links.help}</FooterLink>
          <FooterLink href={link("status")}>{t.footer.links.status}</FooterLink>
          <FooterLink href="/connexion">{t.footer.links.login}</FooterLink>
        </FooterColumn>
        <FooterColumn title={t.footer.legal}>
          <FooterLink href={link("security")}>
            {t.nav.links.security}
          </FooterLink>
          <FooterLink href={link("terms")}>{t.footer.links.terms}</FooterLink>
          <FooterLink href={link("privacy")}>
            {t.footer.links.privacy}
          </FooterLink>
          <li>
            <LanguageLink
              locale={locale}
              t={t}
              page={page}
              className="text-white/75 underline-offset-2 hover:text-white hover:underline"
            />
          </li>
        </FooterColumn>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-xs sm:flex-row sm:justify-between">
          <p>{t.footer.fictional}</p>
          <p>{t.footer.rights}</p>
        </div>
      </div>
    </footer>
  );
}
