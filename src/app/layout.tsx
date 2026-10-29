import "@fontsource-variable/plus-jakarta-sans";
import "./globals.css";

import type { Metadata } from "next";
import { connection } from "next/server";
import type { ReactNode } from "react";

import { LocaleProvider } from "@/i18n/app/locale-context";
import { uiLocale } from "@/i18n/app/server";
import { currentColorMode } from "@/server/color-mode";
import { currentConsent } from "@/server/consent";
import { CookieBanner } from "@/ui/cookie-banner";

export const metadata: Metadata = {
  title: { default: "Stivea Vet", template: "%s · Stivea Vet" },
  description: "Le suivi post-consultation des cabinets vétérinaires.",
  robots: { index: false, follow: false },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  // Rendu à la requête pour toutes les pages : condition pour que Next.js applique le nonce CSP.
  await connection();
  // Posée par le proxy : langue de l'adresse sur le site, sinon choix de la personne (ADR 0022).
  const lang = await uiLocale();
  // Posé dès le rendu serveur : la page arrive dans le mode choisi, sans éclair (ADR 0052).
  const [mode, consent] = await Promise.all([
    currentColorMode(),
    currentConsent(),
  ]);
  return (
    <html lang={lang} data-mode={mode} className="h-full">
      <body className="min-h-full">
        <LocaleProvider locale={lang}>{children}</LocaleProvider>
        {/* Première visite, ou choix de plus de six mois : on demande (ADR 0053). */}
        {consent ? null : <CookieBanner locale={lang} />}
      </body>
    </html>
  );
}
