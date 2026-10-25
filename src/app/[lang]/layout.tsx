import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { isLocale } from "@/i18n/locales";

/**
 * Site public : /fr/… et /en/… uniquement ; toute autre langue n'existe pas.
 * Thème sombre propre au site (ADR 0043).
 */
export default async function SiteLayout({
  children,
  params,
}: Readonly<{ children: ReactNode; params: Promise<{ lang: string }> }>) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return (
    // Un seul contexte d'empilement pour tout le site : les fonds des sections (z négatif)
    // passent sous le contenu de toutes les sections et peuvent se chevaucher en fondu.
    <div className="theme-site isolate min-h-screen overflow-x-clip bg-canvas text-ink">
      {children}
    </div>
  );
}
