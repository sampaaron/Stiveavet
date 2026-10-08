import "@fontsource-variable/plus-jakarta-sans";
import "./globals.css";

import type { Metadata } from "next";
import { connection } from "next/server";
import type { ReactNode } from "react";

import { LocaleProvider } from "@/i18n/app/client";
import { uiLocale } from "@/i18n/app/server";

export const metadata: Metadata = {
  title: { default: "Stivea Vet", template: "%s · Stivea Vet" },
  description: "Le suivi post-consultation des cabinets vétérinaires.",
  icons: { icon: "/logo-stivea-vet.png" },
  robots: { index: false, follow: false },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  // Rendu à la requête pour toutes les pages : condition pour que Next.js applique le nonce CSP.
  await connection();
  // Posée par le proxy : langue de l'adresse sur le site, sinon choix de la personne (ADR 0022).
  const lang = await uiLocale();
  return (
    <html lang={lang} className="h-full">
      <body className="min-h-full">
        <LocaleProvider locale={lang}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
