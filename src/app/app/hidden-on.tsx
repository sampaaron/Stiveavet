"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Masque un rappel sur les pages qui montrent déjà la même information en détail. */
export function HiddenOn({
  paths,
  children,
}: {
  paths: readonly string[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  return paths.includes(pathname) ? null : children;
}
