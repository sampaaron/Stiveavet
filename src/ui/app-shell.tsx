import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { SidebarNav } from "./sidebar-nav";

type AppShellProps = {
  organizationName: string;
  user: { name: string; roleLabel: string };
  /** Actions du compte (verrouiller, se déconnecter), sous l'identité. */
  accountActions?: ReactNode;
  /** Permissions de la personne, pour n'afficher que les écrans autorisés. */
  permissions: readonly string[];
  children: ReactNode;
};

/** Poste de travail : barre latérale blanche à gauche, zone centrale très claire. */
export function AppShell({
  organizationName,
  user,
  accountActions,
  permissions,
  children,
}: AppShellProps) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[264px_1fr]">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2"
      >
        Aller au contenu
      </a>
      <SidebarNav
        permissions={permissions}
        brand={
          <Link href="/app" className="flex items-center gap-3">
            <Image
              src="/logo-stivea-vet.png"
              alt=""
              width={36}
              height={34}
              className="rounded-[10px]"
            />
            <span className="leading-tight">
              <span className="block text-[15px] font-bold tracking-tight">
                stivea <span className="text-brand">vet</span>
              </span>
              <span className="block truncate text-xs text-ink-muted">
                {organizationName}
              </span>
            </span>
          </Link>
        }
        footer={
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3 rounded-[var(--radius-control)] p-2">
              <span
                aria-hidden="true"
                className="grid size-9 place-items-center rounded-full bg-brand-soft text-sm font-bold text-brand-ink"
              >
                {initials(user.name)}
              </span>
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-sm font-semibold">
                  {user.name}
                </span>
                <span className="block truncate text-xs text-ink-muted">
                  {user.roleLabel}
                </span>
              </span>
            </div>
            {accountActions}
          </div>
        }
      />
      <main id="contenu" className="min-w-0 px-4 py-6 sm:px-8 lg:py-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((part) => /^\p{L}/u.test(part))
    .slice(-2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
