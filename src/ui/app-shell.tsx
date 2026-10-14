import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { appDictionary } from "@/i18n/app";
import type { Locale } from "@/i18n/locales";

import { AppTopbar } from "./app-topbar";
import { SidebarNav } from "./sidebar-nav";
import { initials } from "./format";

type AppShellProps = {
  organizationName: string;
  user: { name: string; roleLabel: string };
  /** Actions du compte (verrouiller, se déconnecter), sous l'identité, à droite. */
  accountActions?: ReactNode;
  /** Sous l'identité, à gauche (choix de la langue). */
  accountFooter?: ReactNode;
  /** Permissions de la personne, pour n'afficher que les écrans autorisés. */
  permissions: readonly string[];
  locale: Locale;
  /** Alertes sans accusé de réception, pour la cloche et la barre latérale. */
  pendingAlerts: number;
  children: ReactNode;
};

/**
 * Poste de travail : barre latérale sur le fond « chrome », contenu dans un panneau arrondi
 * légèrement surélevé, avec la recherche et la cloche des alertes en tête.
 */
export function AppShell({
  organizationName,
  user,
  accountActions,
  accountFooter,
  permissions,
  locale,
  pendingAlerts,
  children,
}: AppShellProps) {
  const canSearch = [
    "followups.read_all",
    "followups.read_own",
    "followups.read_summary",
  ].some((key) => permissions.includes(key));
  return (
    <div className="min-h-screen bg-chrome lg:grid lg:grid-cols-[272px_minmax(0,1fr)]">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2"
      >
        {appDictionary(locale).shell.skipToContent}
      </a>
      <SidebarNav
        permissions={permissions}
        pendingAlerts={pendingAlerts}
        brand={
          <Link href="/app" className="flex min-w-0 items-center gap-3">
            <Image
              src="/logo-stivea-vet.png"
              alt=""
              width={36}
              height={34}
              className="shrink-0 rounded-[10px] ring-1 ring-white/15"
            />
            <span className="min-w-0 leading-tight">
              <span className="block text-[15px] font-bold tracking-tight">
                stivea <span className="text-mint">vet</span>
              </span>
              <span className="block truncate text-xs text-white/60">
                {organizationName}
              </span>
            </span>
          </Link>
        }
        footer={
          <div className="flex flex-col gap-1 rounded-[var(--radius-card)] bg-white/6 p-2 ring-1 ring-white/10">
            <div className="flex items-center gap-2.5 p-1">
              <span
                aria-hidden="true"
                className="grid size-9 shrink-0 place-items-center rounded-full bg-mint text-sm font-bold text-night"
              >
                {initials(user.name)}
              </span>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-sm font-semibold">
                  {user.name}
                </span>
                <span className="block truncate text-xs text-white/60">
                  {user.roleLabel}
                </span>
              </span>
            </div>
            <div className="flex items-center gap-1 border-t border-white/10 pt-1">
              <div className="min-w-0 flex-1">{accountFooter}</div>
              {accountActions}
            </div>
          </div>
        }
      />
      <div className="min-w-0 lg:py-2 lg:pr-2">
        <div className="min-h-screen clinical-grid lg:min-h-[calc(100vh-1rem)] lg:rounded-[var(--radius-panel)] lg:border lg:border-line lg:shadow-[var(--shadow-card)]">
          <AppTopbar
            canSearch={canSearch}
            canSeeAlerts={permissions.includes("clinical.read")}
            pendingAlerts={pendingAlerts}
          />
          <main
            id="contenu"
            className="min-w-0 px-4 pt-6 pb-10 sm:px-8 lg:px-10 lg:pt-8"
          >
            <div className="mx-auto max-w-6xl">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
