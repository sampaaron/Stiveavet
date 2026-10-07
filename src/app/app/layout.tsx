import type { ReactNode } from "react";

import { cabinet, currentUser } from "@/fixtures/cabinet-tilleuls";
import { AppShell } from "@/ui/app-shell";

/**
 * Espace cabinet. Lot 2 : données fictives et utilisateur fictif ;
 * l'authentification et le contrôle des droits arrivent aux lots 4 et 5.
 */
export default function CabinetLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <AppShell
      organizationName={cabinet.name}
      user={{ name: currentUser.name, roleLabel: currentUser.roleLabel }}
    >
      {children}
    </AppShell>
  );
}
