import { LockKeyhole, LogOut } from "lucide-react";
import type { ReactNode } from "react";

import { AUTH_POLICY } from "@/domains/auth/policy";
import { appText } from "@/i18n/app/server";
import { memberProfile } from "@/server/auth/profile";
import { memberContext } from "@/server/authz";
import { services } from "@/server/services";
import { AppShell } from "@/ui/app-shell";
import { Button } from "@/ui/button";

import { lockAction, logoutAction } from "../(auth)/actions";
import { LanguageSwitch } from "../language-switch";

import { AlertsNotice } from "./alerts-notice";
import { BillingNotice } from "./billing-notice";
import { IdleLock } from "./idle-lock";

/**
 * Espace cabinet : réservé à une session active et déverrouillée.
 * Chaque page et action rappelle aussi `requireSession()` : la mise en page seule ne protège
 * pas une action serveur appelée directement.
 */
export default async function CabinetLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const context = await memberContext();
  const { t, locale } = await appText();
  const [profile, alerts] = await Promise.all([
    memberProfile(context),
    services.alerts().open(context),
  ]);

  return (
    <AppShell
      organizationName={profile.organizationName}
      user={{
        name: profile.displayName,
        roleLabel: t.labels.roles[context.role],
      }}
      permissions={[...context.permissions]}
      locale={locale}
      accountActions={
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <form action={lockAction} className="flex-1">
              <Button
                type="submit"
                variant="secondary"
                size="sm"
                className="w-full"
                icon={<LockKeyhole aria-hidden="true" className="size-3.5" />}
              >
                {t.shell.lock}
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
                {t.shell.logout}
              </Button>
            </form>
          </div>
          <LanguageSwitch />
        </div>
      }
    >
      <IdleLock idleMinutes={AUTH_POLICY.idleLockMinutes} />
      <BillingNotice
        access={context.billing}
        canManage={context.permissions.has("billing.manage")}
      />
      <AlertsNotice alerts={alerts} />
      {children}
    </AppShell>
  );
}
