import "@fontsource-variable/fraunces";

import { LockKeyhole, LogOut, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { AUTH_POLICY } from "@/domains/auth/policy";
import { appText } from "@/i18n/app/server";
import { memberProfile } from "@/server/auth/profile";
import { memberContext } from "@/server/authz";
import { AppShell } from "@/ui/app-shell";

import { lockAction, logoutAction } from "../(auth)/actions";
import { LanguageSwitch } from "../language-switch";

import { pendingAlertCounts } from "./alert-counts";
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
    pendingAlertCounts(context),
  ]);

  return (
    <AppShell
      pendingAlerts={alerts.pending}
      organizationName={profile.organizationName}
      user={{
        name: profile.displayName,
        roleLabel: t.labels.roles[context.role],
      }}
      permissions={[...context.permissions]}
      locale={locale}
      accountActions={
        <div className="flex shrink-0 gap-0.5">
          <Link
            href="/app/compte"
            title={t.shell.account}
            className="grid size-9 place-items-center rounded-full text-white/75 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-mint"
          >
            <ShieldCheck aria-hidden="true" className="size-4" />
            <span className="sr-only">{t.shell.account}</span>
          </Link>
          <form action={lockAction}>
            <button
              type="submit"
              title={t.shell.lock}
              className="grid size-9 place-items-center rounded-full text-white/75 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-mint"
            >
              <LockKeyhole aria-hidden="true" className="size-4" />
              <span className="sr-only">{t.shell.lock}</span>
            </button>
          </form>
          <form action={logoutAction}>
            <button
              type="submit"
              title={t.shell.logout}
              className="grid size-9 place-items-center rounded-full text-white/75 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-mint"
            >
              <LogOut aria-hidden="true" className="size-4" />
              <span className="sr-only">{t.shell.logout}</span>
            </button>
          </form>
        </div>
      }
      accountFooter={<LanguageSwitch variant="onDark" />}
    >
      <IdleLock idleMinutes={AUTH_POLICY.idleLockMinutes} />
      <BillingNotice
        access={context.billing}
        canManage={context.permissions.has("billing.manage")}
        commitmentReminder={context.commitmentReminder}
      />
      <AlertsNotice counts={alerts} />
      {children}
    </AppShell>
  );
}
