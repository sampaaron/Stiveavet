import "@fontsource-variable/plus-jakarta-sans";
import "./globals.css";

import type { Metadata } from "next";
import { connection } from "next/server";
import type { ReactNode } from "react";

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
  return (
    <html lang="fr" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
