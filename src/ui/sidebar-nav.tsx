"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";

import { cn } from "./cn";
import { appNavigation, isNavItemActive } from "./navigation";

type SidebarNavProps = { brand: ReactNode; footer: ReactNode };

export function SidebarNav({ brand, footer }: SidebarNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <aside className="border-b border-line bg-surface lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:border-r lg:border-b-0">
      <div className="flex items-center justify-between gap-3 px-4 py-3 lg:px-5 lg:py-6">
        {brand}
        <button
          type="button"
          className="rounded-md p-2 text-ink-muted hover:bg-canvas-subtle lg:hidden"
          aria-expanded={open}
          aria-controls="navigation-principale"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? (
            <X aria-hidden="true" className="size-5" />
          ) : (
            <Menu aria-hidden="true" className="size-5" />
          )}
          <span className="sr-only">
            {open ? "Fermer le menu" : "Ouvrir le menu"}
          </span>
        </button>
      </div>
      <div
        id="navigation-principale"
        className={cn(
          "flex-1 flex-col overflow-y-auto px-3 pb-4 lg:flex",
          open ? "flex" : "hidden",
        )}
      >
        <nav aria-label="Navigation principale" className="flex-1">
          {appNavigation.map((section, index) => (
            <div key={section.label ?? index} className="mb-4">
              {section.label ? (
                <p className="px-3 pb-1 text-xs font-semibold tracking-wide text-ink-muted uppercase">
                  {section.label}
                </p>
              ) : null}
              <ul className="space-y-0.5">
                {section.items.map(({ href, label, icon: Icon }) => {
                  const active = isNavItemActive(href, pathname);
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        aria-current={active ? "page" : undefined}
                        // Le menu mobile se referme après chaque navigation.
                        onClick={() => setOpen(false)}
                        className={cn(
                          "flex items-center gap-3 rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium transition-colors",
                          active
                            ? "bg-brand-soft font-semibold text-brand-ink"
                            : "text-ink-muted hover:bg-canvas-subtle hover:text-ink",
                        )}
                      >
                        <Icon aria-hidden="true" className="size-[18px]" />
                        {label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="border-t border-line pt-3">{footer}</div>
      </div>
    </aside>
  );
}
