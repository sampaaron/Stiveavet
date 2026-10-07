import "@fontsource-variable/fraunces";

import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { isLocale } from "@/i18n/locales";

/** Site public : /fr/… et /en/… uniquement ; toute autre langue n'existe pas. */
export default async function SiteLayout({
  children,
  params,
}: Readonly<{ children: ReactNode; params: Promise<{ lang: string }> }>) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return children;
}
