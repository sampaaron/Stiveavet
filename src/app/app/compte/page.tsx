import type { Metadata } from "next";

import { Check } from "lucide-react";

import { isPermissionKey } from "@/domains/equipe/permissions";
import { appText } from "@/i18n/app/server";
import { auth } from "@/server/auth";
import { accountOverview } from "@/server/auth/account-overview";
import { readAuthCookie } from "@/server/auth/cookies";
import { memberContext } from "@/server/authz";
import { Card, SectionCard } from "@/ui/card";
import { formatDate, formatDateTime, initials } from "@/ui/format";
import { PageHeader } from "@/ui/page-header";

import {
  AddPasskeyForm,
  PasswordForm,
  RemovePasskeyForm,
  RevokeDeviceForm,
  RevokeOtherSessionsForm,
} from "./account-forms";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await appText();
  return { title: t.account.title };
}

/**
 * Mon compte : ouvert à tout membre, pour son propre compte seulement (ADR 0039). Identité,
 * activité, droits, puis sécurité ; rien d'un autre membre ni aucun contenu clinique.
 */
export default async function AccountPage() {
  const context = await memberContext();
  const sessionToken = await readAuthCookie("session");
  const [{ t, locale }, overview, security, passkeys] = await Promise.all([
    appText(),
    accountOverview(context),
    auth().accountSecurity(sessionToken, await readAuthCookie("device")),
    auth().accountPasskeys(sessionToken),
  ]);
  const text = t.account;
  const others = security.sessions.filter((session) => !session.current);
  const rights = Object.keys(t.labels.permissions)
    .filter(isPermissionKey)
    .filter((key) => context.permissions.has(key));
  const details: [string, string][] = [
    [text.profile.email, overview.email],
    [text.profile.organization, overview.organizationName],
    [text.profile.role, t.labels.roles[context.role]],
    ...(context.plan
      ? [
          [text.profile.plan, t.labels.plans[context.plan].name] as [
            string,
            string,
          ],
        ]
      : []),
    [text.profile.alertPhone, overview.alertPhone ?? text.profile.noAlertPhone],
    [text.profile.language, text.profile.languages[overview.language]],
    [text.profile.memberSince, formatDate(overview.memberSince, locale)],
  ];

  return (
    <>
      <PageHeader title={text.title} description={text.description} />
      <div className="grid gap-6">
        <Card className="overflow-hidden">
          <div className="flex items-center gap-4 border-b border-line/70 bg-gradient-to-r from-mint/25 via-surface to-surface p-5 sm:p-6">
            <span
              aria-hidden="true"
              className="grid size-16 shrink-0 place-items-center rounded-full bg-night text-xl font-bold text-mint ring-4 ring-white"
            >
              {initials(overview.displayName)}
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-xl font-bold tracking-tight">
                {overview.displayName}
              </h2>
              <p className="truncate text-sm text-ink-muted">
                {t.labels.roles[context.role]} · {overview.organizationName}
              </p>
            </div>
          </div>
          <div className="p-5 sm:p-6">
            <h3 className="sr-only">{text.profile.title}</h3>
            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {details.map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-xs font-medium tracking-wide text-ink-muted uppercase">
                    {label}
                  </dt>
                  <dd className="mt-0.5 text-[15px] font-medium break-words">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-5 text-sm text-ink-muted">
              {text.profile.changeHint}
            </p>
          </div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <SectionCard
            title={text.activity.title}
            description={text.activity.description}
          >
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {(
                [
                  "active",
                  "paused",
                  "human_takeover",
                  "draft",
                  "ended",
                ] as const
              ).map((status) => (
                <div
                  key={status}
                  className="rounded-[var(--radius-control)] border border-line/70 bg-canvas/60 px-3 py-2.5"
                >
                  <dt className="text-xs text-ink-muted">
                    {text.activity.statuses[status]}
                  </dt>
                  <dd className="text-2xl font-bold tabular-nums">
                    {overview.followups[status]}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-sm">
              <span className="text-ink-muted">{text.activity.stive} : </span>
              <span className="font-semibold">
                {overview.stive
                  ? text.activity.stiveUsage(
                      overview.stive.used,
                      overview.stive.limit,
                    )
                  : text.activity.stiveOff}
              </span>
            </p>
          </SectionCard>

          <SectionCard
            title={text.rights.title}
            description={text.rights.description}
          >
            <ul className="grid gap-2">
              {rights.map((key) => (
                <li key={key} className="flex gap-2 text-sm">
                  <Check
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-brand-ink"
                  />
                  {t.labels.permissions[key]}
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>

        <SectionCard title={text.privacy.title}>
          <ul className="grid gap-2 text-sm text-ink-muted">
            {text.privacy.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard
          title={text.password.title}
          description={text.password.description}
        >
          <PasswordForm />
        </SectionCard>

        <SectionCard
          id="cles-d-acces"
          title={text.passkeys.title}
          description={text.passkeys.description}
        >
          {passkeys.length === 0 ? (
            <p className="mb-4 text-sm text-ink-muted">{text.passkeys.none}</p>
          ) : (
            <ul className="mb-5 grid gap-3">
              {passkeys.map((passkey) => (
                <li
                  key={passkey.id}
                  className="flex flex-wrap items-start justify-between gap-3 text-sm"
                >
                  <span>
                    <span className="block font-semibold">{passkey.label}</span>
                    <span className="block text-ink-muted">
                      {text.passkeys.addedOn(
                        formatDate(passkey.createdAt, locale),
                      )}{" "}
                      ·{" "}
                      {passkey.lastUsedAt
                        ? text.passkeys.lastUsed(
                            formatDateTime(passkey.lastUsedAt, locale),
                          )
                        : text.passkeys.neverUsed}
                    </span>
                  </span>
                  <RemovePasskeyForm id={passkey.id} label={passkey.label} />
                </li>
              ))}
            </ul>
          )}
          <AddPasskeyForm />
          <p className="mt-4 text-sm text-ink-muted">
            {text.passkeys.loginNote}
          </p>
        </SectionCard>

        <SectionCard
          title={text.sessions.title}
          description={text.sessions.description}
        >
          <ul className="mb-4 grid gap-3">
            {security.sessions.map((session) => (
              <li key={session.id} className="text-sm">
                <span className="block font-semibold">
                  {session.deviceLabel ?? text.sessions.unknownDevice}
                  {session.current ? (
                    <span className="font-normal text-brand-ink">
                      {" "}
                      · {text.sessions.thisDevice}
                    </span>
                  ) : null}
                </span>
                <span className="block text-ink-muted">
                  {text.sessions.opened(
                    formatDateTime(session.createdAt, locale),
                  )}
                  ,{" "}
                  {text.sessions.lastActive(
                    formatDateTime(session.lastActivityAt, locale),
                  )}
                </span>
              </li>
            ))}
          </ul>
          {others.length === 0 ? (
            <p className="mb-3 text-sm text-ink-muted">
              {text.sessions.noOthers}
            </p>
          ) : null}
          <RevokeOtherSessionsForm disabled={others.length === 0} />
        </SectionCard>

        <SectionCard
          title={text.devices.title}
          description={text.devices.description}
        >
          {security.devices.length === 0 ? (
            <p className="text-sm text-ink-muted">{text.devices.none}</p>
          ) : (
            <ul className="grid gap-3">
              {security.devices.map((device) => {
                const label = device.deviceLabel ?? text.sessions.unknownDevice;
                return (
                  <li
                    key={device.id}
                    className="flex flex-wrap items-start justify-between gap-3 text-sm"
                  >
                    <span>
                      <span className="block font-semibold">
                        {label}
                        {device.current ? (
                          <span className="font-normal text-brand-ink">
                            {" "}
                            · {text.sessions.thisDevice}
                          </span>
                        ) : null}
                      </span>
                      <span className="block text-ink-muted">
                        {text.devices.added(
                          formatDate(device.createdAt, locale),
                        )}{" "}
                        ·{" "}
                        {text.devices.until(
                          formatDate(device.expiresAt, locale),
                        )}
                      </span>
                    </span>
                    <RevokeDeviceForm id={device.id} label={label} />
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      </div>
    </>
  );
}
