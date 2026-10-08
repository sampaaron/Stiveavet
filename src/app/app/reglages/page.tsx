import type { Metadata } from "next";

import { APPOINTMENT_KINDS } from "@/domains/agenda/rendez-vous";
import {
  EMERGENCY_PERIODS,
  ESCALATION_CHOICES,
  WEEKDAYS,
} from "@/domains/reglages/content";
import { appText } from "@/i18n/app/server";
import { requirePermission } from "@/server/authz";
import { services } from "@/server/services";
import { AlertBanner } from "@/ui/alert-banner";
import { SectionCard } from "@/ui/card";
import { formatDateTime, formatMinutes, toDateTimeInput } from "@/ui/format";
import { PageHeader } from "@/ui/page-header";

import { IntegrationList } from "./integrations";
import {
  AlertSettingsForm,
  AppointmentDurationsForm,
  ApplyDefaultsForm,
  ContactForm,
  InstructionsForm,
  MessageWindowsForm,
  OnCallForm,
  RemoveContactForm,
  RemoveOnCallForm,
} from "./settings-forms";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await appText();
  return { title: t.settings.title };
}

export default async function SettingsPage() {
  const context = await requirePermission("organization.settings");
  const settings = await services.settings().get(context);
  const { t, locale } = await appText();
  const text = t.settings;

  const windows = new Map(
    settings.messageWindows.map((window) => [window.weekday, window]),
  );
  const appointmentWindows = new Map(
    settings.appointmentWindows.map((window) => [window.weekday, window]),
  );
  const nextHour = new Date();
  nextHour.setMinutes(0, 0, 0);
  nextHour.setHours(nextHour.getHours() + 1);
  const unconfigured =
    settings.messageWindows.length === 0 &&
    Object.keys(settings.instructions).length === 0;

  return (
    <>
      <PageHeader
        title={text.title}
        description={text.description}
      />
      <div className="grid gap-6">
        {unconfigured ? (
          <AlertBanner
            tone="watch"
            title={text.unconfigured.title}
            action={<ApplyDefaultsForm label={text.applyDefaults} />}
          >
            {text.unconfigured.body}
          </AlertBanner>
        ) : null}

        <SectionCard
          title={text.messageWindows.title}
          description={text.messageWindows.description}
        >
          <MessageWindowsForm
            days={WEEKDAYS.map((weekday) => {
              const window = windows.get(weekday);
              return {
                weekday,
                label: t.labels.weekdays[weekday],
                enabled: Boolean(window),
                startsAt: window?.startsAt ?? "08:00",
                endsAt: window?.endsAt ?? "20:00",
              };
            })}
          />
        </SectionCard>

        <SectionCard
          title={text.appointments.title}
          description={text.appointments.description}
        >
          <div className="grid gap-8 lg:grid-cols-2">
            <MessageWindowsForm
              kind="appointments"
              days={WEEKDAYS.map((weekday) => {
                const window = appointmentWindows.get(weekday);
                return {
                  weekday,
                  label: t.labels.weekdays[weekday],
                  enabled: Boolean(window),
                  startsAt: window?.startsAt ?? "09:00",
                  endsAt: window?.endsAt ?? "18:00",
                };
              })}
            />
            <AppointmentDurationsForm
              kinds={APPOINTMENT_KINDS.map((kind) => ({
                kind,
                label: t.labels.appointmentKinds[kind],
                minutes: settings.appointmentMinutes[kind],
              }))}
            />
          </div>
        </SectionCard>

        <SectionCard
          title={text.instructions.title}
          description={text.instructions.description}
        >
          <div className="grid gap-6 lg:grid-cols-2">
            {EMERGENCY_PERIODS.map((period) => (
              <InstructionsForm
                key={period}
                period={period}
                label={t.labels.emergencyPeriods[period]}
                value={settings.instructions[period] ?? ""}
              />
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title={text.contacts.title}
          description={text.contacts.description}
        >
          {settings.contacts.length > 0 ? (
            <ul className="mb-5 grid gap-3">
              {settings.contacts.map((contact) => (
                <li
                  key={contact.id}
                  className="flex flex-wrap items-start justify-between gap-3 text-sm"
                >
                  <span>
                    <span className="block font-semibold">{contact.label}</span>
                    <span className="block text-ink-muted tabular-nums">
                      {contact.phone}
                    </span>
                  </span>
                  <RemoveContactForm id={contact.id} label={contact.label} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-5 text-sm text-ink-muted">
              {text.contacts.empty}
            </p>
          )}
          {settings.contacts.length < 6 ? <ContactForm /> : null}
        </SectionCard>

        <SectionCard
          title={text.alerts.title}
          description={text.alerts.description}
        >
          <AlertSettingsForm
            escalationDelayMinutes={settings.escalationDelayMinutes}
            photoAnalysisEnabled={settings.photoAnalysisEnabled}
            choices={ESCALATION_CHOICES.map((minutes) => ({
              value: String(minutes),
              label: formatMinutes(minutes, locale),
            }))}
          />
        </SectionCard>

        <SectionCard
          title={text.onCall.title}
          description={text.onCall.description}
        >
          {settings.onCall.length > 0 ? (
            <ul className="mb-5 grid gap-3">
              {settings.onCall.map((shift) => {
                const start = formatDateTime(shift.startsAt, locale);
                const end = formatDateTime(shift.endsAt, locale);
                return (
                  <li
                    key={shift.id}
                    className="flex flex-wrap items-start justify-between gap-3 text-sm"
                  >
                    <span>
                      <span className="block font-semibold">{shift.name}</span>
                      <span className="block text-ink-muted">
                        {text.onCall.period(start, end)}
                      </span>
                    </span>
                    <RemoveOnCallForm
                      id={shift.id}
                      label={text.onCall.removeLabel(shift.name, start, end)}
                    />
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mb-5 text-sm text-ink-muted">
              {text.onCall.empty}
            </p>
          )}
          <OnCallForm
            candidates={settings.onCallCandidates.map((candidate) => ({
              value: candidate.membershipId,
              label: candidate.name,
            }))}
            defaultStart={toDateTimeInput(nextHour)}
            defaultEnd={toDateTimeInput(
              new Date(nextHour.getTime() + 12 * 3_600_000),
            )}
          />
        </SectionCard>

        <SectionCard
          title={text.integrations.title}
          description={text.integrations.description}
        >
          <IntegrationList integrations={settings.integrations} />
        </SectionCard>
      </div>
    </>
  );
}
