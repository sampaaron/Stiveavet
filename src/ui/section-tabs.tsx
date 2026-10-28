"use client";

import { usePathname } from "next/navigation";

import { useAppText } from "@/i18n/app/client";

import {
  currentSection,
  isNavItemActive,
  visibleNavigation,
} from "./navigation";
import { SegmentedTabs } from "./segmented-tabs";

/**
 * Onglets de la rubrique ouverte, en tête de page (ADR 0044) : seuls ceux que la personne a
 * le droit d'ouvrir. Rien pour une rubrique d'un seul onglet, ni hors rubrique (compte, aide).
 */
export function SectionTabs({
  permissions,
  pendingAlerts,
}: {
  permissions: readonly string[];
  pendingAlerts: number;
}) {
  const pathname = usePathname();
  const t = useAppText().shell;
  const section = currentSection(
    visibleNavigation(new Set(permissions)),
    pathname,
  );
  if (!section || section.tabs.length < 2) return null;
  return (
    <SegmentedTabs
      label={t.sectionTabs(t.nav[section.label])}
      className="mb-6"
      tabs={section.tabs.map((tab) => ({
        href: tab.href,
        active: isNavItemActive(tab.href, pathname),
        label:
          tab.badge === "alerts" && pendingAlerts > 0 ? (
            <>
              {t.nav[tab.label]}
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-urgent px-1.5 text-[11px] font-bold text-on-strong tabular-nums">
                <span className="sr-only">
                  {t.alertsPending(pendingAlerts)}
                </span>
                <span aria-hidden="true">{pendingAlerts}</span>
              </span>
            </>
          ) : (
            t.nav[tab.label]
          ),
      }))}
    />
  );
}
