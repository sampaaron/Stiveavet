import { Check, KeyRound, MonitorSmartphone } from "lucide-react";
import type { Metadata } from "next";

import { deviceLabel } from "@/domains/auth/device";
import { isPermissionKey } from "@/domains/equipe/permissions";
import { appText } from "@/i18n/app/server";
import { memberAccount } from "@/server/auth/account";
import { memberProfile } from "@/server/auth/profile";
import { memberContext } from "@/server/authz";
import { ButtonLink } from "@/ui/button";
import { SectionCard } from "@/ui/card";
import { formatDate, formatDateTime } from "@/ui/format";
import { PageHeader } from "@/ui/page-header";
import { EmptyState } from "@/ui/states";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await appText();
  return { title: t.account.title };
}

/**
 * Mon compte : ce que Stivea Vet sait de la personne connectée, pour elle seule. Ouvert à
 * tout membre actif, sans permission particulière ; rien d'un autre membre n'y est lu.
 */
export default async function AccountPage() {
  const context = await memberContext();
  const [account, profile, { t, locale }] = await Promise.all([
    memberAccount(context),
    memberProfile(context),
    appText(),
  ]);
  const text = t.account;
  const rights = [...context.permissions]
    .filter(isPermissionKey)
    .map((key) => t.labels.permissions[key])
    .sort((a, b) => a.localeCompare(b, locale));
  const identity = [
    [text.identity.name, account.displayName],
    [text.identity.email, account.email],
    [text.identity.role, t.labels.roles[context.role]],
    [text.identity.organization, profile.organizationName],
    [text.identity.joinedAt, formatDate(account.joinedAt, locale)],
    [text.identity.language, t.labels.languages[account.uiLocale]],
  ] as const;

  return (
    <>
      <PageHeader title={text.title} description={text.description} />
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title={text.identity.title}>
          <dl className="divide-y divide-line/70">
            {identity.map(([label, value]) => (
              <div
                key={label}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5 first:pt-0 last:pb-0"
              >
                <dt className="text-sm text-ink-muted">{label}</dt>
                <dd className="min-w-0 text-sm font-medium break-words">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </SectionCard>

        <SectionCard
          title={text.alerts.title}
          description={text.alerts.description}
          action={
            context.permissions.has("clinical.read") ? (
              <ButtonLink href="/app/alertes" variant="secondary">
                {text.alerts.manage}
              </ButtonLink>
            ) : undefined
          }
        >
          <p className="text-xs font-semibold text-ink-muted">
            {text.alerts.phone}
          </p>
          <p className="mt-1 text-sm font-medium">
            {account.alertPhone ?? text.alerts.none}
          </p>
        </SectionCard>

        <SectionCard
          title={text.security.title}
          description={text.security.description}
          action={
            <ButtonLink
              href="/mot-de-passe-oublie"
              variant="secondary"
              icon={<KeyRound aria-hidden="true" className="size-4" />}
            >
              {text.security.changePassword}
            </ButtonLink>
          }
        >
          {account.logins.length === 0 ? (
            <EmptyState title={text.security.empty} />
          ) : (
            <ul className="grid gap-2">
              {account.logins.map((login) => (
                <li
                  key={`${login.kind}-${login.occurredAt.toISOString()}`}
                  className="flex items-center gap-3 rounded-[var(--radius-card)] border border-line/70 px-3 py-2"
                >
                  <MonitorSmartphone
                    aria-hidden="true"
                    className="size-4 shrink-0 text-ink-muted"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      {t.journal.logins[login.kind]}
                    </span>
                    <span className="block truncate text-xs text-ink-muted">
                      {deviceLabel(login.userAgent) ??
                        text.security.unknownDevice}
                    </span>
                  </span>
                  <time
                    dateTime={login.occurredAt.toISOString()}
                    className="shrink-0 text-xs text-ink-muted"
                  >
                    {formatDateTime(login.occurredAt, locale)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title={text.rights.title}
          description={text.rights.description}
        >
          <ul className="grid gap-2">
            {rights.map((label) => (
              <li key={label} className="flex items-start gap-2 text-sm">
                <Check
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-brand"
                />
                {label}
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </>
  );
}
