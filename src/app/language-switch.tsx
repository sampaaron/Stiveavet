"use client";

import { Languages } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";

import { useAppText, useLocale } from "@/i18n/app/client";
import { Button } from "@/ui/button";

import { chooseLocaleAction } from "./locale-actions";

/**
 * Bascule de langue de l'interface (ADR 0022) : enregistrée dans le compte si la personne est
 * connectée, puis retour à la même page.
 */
export function LanguageSwitch({
  className,
  variant = "quiet",
}: {
  className?: string;
  variant?: "quiet" | "onDark";
}) {
  const t = useAppText().common.language;
  const locale = useLocale();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  return (
    <form action={chooseLocaleAction} className={className}>
      <input
        type="hidden"
        name="locale"
        value={locale === "fr" ? "en" : "fr"}
      />
      <input
        type="hidden"
        name="back"
        value={search ? `${pathname}?${search}` : pathname}
      />
      <Button
        type="submit"
        variant={variant}
        size="sm"
        className={variant === "onDark" ? "w-full justify-start" : "w-full"}
        icon={<Languages aria-hidden="true" className="size-3.5" />}
      >
        <span className="sr-only">{t.label} </span>
        <span lang={locale === "fr" ? "en" : "fr"}>{t.switchTo}</span>
      </Button>
    </form>
  );
}
