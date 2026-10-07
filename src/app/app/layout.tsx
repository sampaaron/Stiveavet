import { LockKeyhole, LogOut } from "lucide-react";
import type { ReactNode } from "react";

import { AUTH_POLICY } from "@/domains/auth/policy";
import { requireSession } from "@/server/auth";
import { memberProfile } from "@/server/auth/profile";
import { AppShell } from "@/ui/app-shell";
import { Button } from "@/ui/button";

import { lockAction, logoutAction } from "../(auth)/actions";

import { IdleLock } from "./idle-lock";

/**
 * Espace cabinet : réservé à une session active et déverrouillée.
 * Chaque page et action rappelle aussi `requireSession()` : la mise en page seule ne protège
 * pas une action serveur appelée directement.
 */
export default async function CabinetLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const session = await requireSession();
  const profile = await memberProfile(session);

  return (
    <AppShell
      organizationName={profile.organizationName}
      user={{ name: profile.displayName, roleLabel: profile.roleLabel }}
      accountActions={
        <div className="flex gap-2">
          <form action={lockAction} className="flex-1">
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              className="w-full"
              icon={<LockKeyhole aria-hidden="true" className="size-3.5" />}
            >
              Verrouiller
            </Button>
          </form>
          <form action={logoutAction} className="flex-1">
            <Button
              type="submit"
              variant="quiet"
              size="sm"
              className="w-full"
              icon={<LogOut aria-hidden="true" className="size-3.5" />}
            >
              Déconnexion
            </Button>
          </form>
        </div>
      }
    >
      <IdleLock idleMinutes={AUTH_POLICY.idleLockMinutes} />
      {children}
    </AppShell>
  );
}
