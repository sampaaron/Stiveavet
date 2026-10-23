import type { Metadata } from "next";

import { appText } from "@/i18n/app/server";
import { auth } from "@/server/auth";
import { readAuthCookie } from "@/server/auth/cookies";
import { memberContext } from "@/server/authz";
import { SectionCard } from "@/ui/card";
import { formatDate, formatDateTime } from "@/ui/format";
import { PageHeader } from "@/ui/page-header";

import {
  PasswordForm,
  RevokeDeviceForm,
  RevokeOtherSessionsForm,
} from "./account-forms";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await appText();
  return { title: t.account.title };
}

/** Sécurité du compte : ouverte à tout membre, pour son propre compte (ADR 0039). */
export default async function AccountSecurityPage() {
  await memberContext();
  const [{ t, locale }, security] = await Promise.all([
    appText(),
    auth().accountSecurity(
      await readAuthCookie("session"),
      await readAuthCookie("device"),
    ),
  ]);
  const text = t.account;
  const others = security.sessions.filter((session) => !session.current);

  return (
    <>
      <PageHeader title={text.title} description={text.description} />
      <div className="grid gap-6">
        <SectionCard
          title={text.password.title}
          description={text.password.description}
        >
          <PasswordForm />
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
