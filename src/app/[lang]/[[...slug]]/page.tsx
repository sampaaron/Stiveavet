import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { isLocale, LOCALES } from "@/i18n/locales";
import type { Locale } from "@/i18n/locales";
import { pageFor, pathFor } from "@/i18n/routes";
import type { SitePage } from "@/i18n/routes";
import { siteDictionary } from "@/i18n/site";
import type { SiteDictionary } from "@/i18n/site";

import { SiteFooter, SiteHeader } from "../_site/chrome";
import { DemoPage, DemoSpacePage, UnsubscribePage } from "../_site/pages/demo";
import { HomePage } from "../_site/pages/home";
import {
  HelpPage,
  LegalPage,
  PricingPage,
  SecurityPage,
  StatusPage,
  TrialPage,
} from "../_site/pages/info";
import {
  HowPage,
  IntegrationsPage,
  NumaPage,
  StivePage,
} from "../_site/pages/product";

type Resolved = { locale: Locale; page: SitePage; t: SiteDictionary };

async function resolve(
  params: PageProps<"/[lang]/[[...slug]]">["params"],
): Promise<Resolved> {
  const { lang, slug } = await params;
  if (!isLocale(lang)) notFound();
  const page = pageFor(lang, slug ?? []);
  if (!page) notFound();
  return { locale: lang, page, t: siteDictionary(lang) };
}

function single(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export async function generateMetadata({
  params,
}: PageProps<"/[lang]/[[...slug]]">): Promise<Metadata> {
  const { locale, page, t } = await resolve(params);
  const meta = t.meta[page];
  return {
    title:
      page === "home" ? { absolute: `Stivea Vet · ${meta.title}` } : meta.title,
    description: meta.description,
    alternates: {
      languages: Object.fromEntries(
        LOCALES.map((other) => [other, pathFor(page, other)]),
      ),
    },
    openGraph: { locale: locale === "fr" ? "fr_FR" : "en_GB" },
  };
}

export default async function SitePage({
  params,
  searchParams,
}: PageProps<"/[lang]/[[...slug]]">) {
  const { locale, page, t } = await resolve(params);
  const query = await searchParams;
  const props = { locale, t };

  const content: Record<SitePage, () => ReactNode> = {
    home: () => <HomePage {...props} />,
    how: () => <HowPage {...props} />,
    numa: () => <NumaPage {...props} />,
    stive: () => <StivePage {...props} />,
    integrations: () => <IntegrationsPage {...props} />,
    pricing: () => <PricingPage {...props} />,
    security: () => <SecurityPage {...props} />,
    help: () => <HelpPage {...props} />,
    status: () => <StatusPage {...props} />,
    trial: () => <TrialPage {...props} />,
    demo: () => <DemoPage {...props} expired={query.acces === "expire"} />,
    demoSpace: () => (
      <DemoSpacePage {...props} followupId={single(query.suivi)} />
    ),
    terms: () => <LegalPage {...props} document="terms" />,
    privacy: () => <LegalPage {...props} document="privacy" />,
    unsubscribe: () => (
      <UnsubscribePage {...props} token={single(query.jeton)} />
    ),
  };

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#contenu"
        className="sr-only z-50 rounded-[10px] bg-surface px-4 py-2 font-semibold focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {t.common.skipToContent}
      </a>
      <SiteHeader locale={locale} t={t} page={page} />
      <main id="contenu" className="flex-1">
        {content[page]()}
      </main>
      <SiteFooter locale={locale} t={t} page={page} />
    </div>
  );
}
