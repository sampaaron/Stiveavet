import type { ReactNode } from "react";

/** Chaque écran de l'espace cabinet apparaît en douceur (ADR 0033). */
export default function CabinetTemplate({
  children,
}: Readonly<{ children: ReactNode }>) {
  return <div className="motion-safe:animate-rise-in">{children}</div>;
}
