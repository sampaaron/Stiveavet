import type { Metadata } from "next";

import {
  EMERGENCY_PERIODS,
  EMERGENCY_PERIOD_LABELS,
  ESCALATION_CHOICES,
  WEEKDAYS,
  WEEKDAY_LABELS,
  escalationLabel,
} from "@/domains/reglages/content";
import { requirePermission } from "@/server/authz";
import { services } from "@/server/services";
import { AlertBanner } from "@/ui/alert-banner";
import { SectionCard } from "@/ui/card";
import { formatDateTime, toDateTimeInput } from "@/ui/format";
import { PageHeader } from "@/ui/page-header";

import { IntegrationList } from "./integrations";
import {
  AlertSettingsForm,
  ApplyDefaultsForm,
  ContactForm,
  InstructionsForm,
  MessageWindowsForm,
  OnCallForm,
  RemoveContactForm,
  RemoveOnCallForm,
} from "./settings-forms";

export const metadata: Metadata = { title: "Numa, urgences et garde" };

export default async function SettingsPage() {
  const context = await requirePermission("organization.settings");
  const settings = await services.settings().get(context);

  const windows = new Map(
    settings.messageWindows.map((window) => [window.weekday, window]),
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
        title="Numa, urgences et garde"
        description="Ce que Numa, assistante IA, applique à tous les suivis du cabinet. Numa ne prend jamais de décision médicale : elle transmet vos consignes et vous alerte."
      />
      <div className="grid gap-6">
        {unconfigured ? (
          <AlertBanner
            tone="watch"
            title="Ces réglages ne sont pas encore définis."
            action={
              <ApplyDefaultsForm label="Appliquer les réglages de départ" />
            }
          >
            Les réglages de départ (envois du lundi au samedi de 8 h à 20 h,
            consignes d&apos;urgence génériques) se modifient ensuite ici.
          </AlertBanner>
        ) : null}

        <SectionCard
          title="Horaires d'envoi des messages"
          description="Numa n'envoie ses messages programmés aux propriétaires que pendant ces plages (heure de Paris). Une réponse du propriétaire est toujours reçue."
        >
          <MessageWindowsForm
            days={WEEKDAYS.map((weekday) => {
              const window = windows.get(weekday);
              return {
                weekday,
                label: WEEKDAY_LABELS[weekday],
                enabled: Boolean(window),
                startsAt: window?.startsAt ?? "08:00",
                endsAt: window?.endsAt ?? "20:00",
              };
            })}
          />
        </SectionCard>

        <SectionCard
          title="Consignes d'urgence"
          description="Transmises telles quelles au propriétaire quand Numa détecte un signe d'urgence, selon le moment. Rédigez-les vous-même : Numa n'y ajoute aucun conseil médical."
        >
          <div className="grid gap-6 lg:grid-cols-2">
            {EMERGENCY_PERIODS.map((period) => (
              <InstructionsForm
                key={period}
                period={period}
                label={EMERGENCY_PERIOD_LABELS[period]}
                value={settings.instructions[period] ?? ""}
              />
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Contacts d'urgence"
          description="Numéros communiqués au propriétaire avec les consignes (6 au plus)."
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
              Aucun contact d&apos;urgence pour l&apos;instant.
            </p>
          )}
          {settings.contacts.length < 6 ? <ContactForm /> : null}
        </SectionCard>

        <SectionCard
          title="Règles d'alerte"
          description="Le délai d'escalade se règle entre 3 et 5 heures."
        >
          <AlertSettingsForm
            escalationDelayMinutes={settings.escalationDelayMinutes}
            photoAnalysisEnabled={settings.photoAnalysisEnabled}
            choices={ESCALATION_CHOICES.map((minutes) => ({
              value: String(minutes),
              label: escalationLabel(minutes),
            }))}
          />
        </SectionCard>

        <SectionCard
          title="Planning de garde"
          description="Une alerte urgente va d'abord au vétérinaire responsable du suivi ou au vétérinaire de garde. Une garde dure au plus 14 jours et ne chevauche pas une autre."
        >
          {settings.onCall.length > 0 ? (
            <ul className="mb-5 grid gap-3">
              {settings.onCall.map((shift) => {
                const label = `de ${shift.name}, du ${formatDateTime(shift.startsAt)} au ${formatDateTime(shift.endsAt)}`;
                return (
                  <li
                    key={shift.id}
                    className="flex flex-wrap items-start justify-between gap-3 text-sm"
                  >
                    <span>
                      <span className="block font-semibold">{shift.name}</span>
                      <span className="block text-ink-muted">
                        Du {formatDateTime(shift.startsAt)} au{" "}
                        {formatDateTime(shift.endsAt)}
                      </span>
                    </span>
                    <RemoveOnCallForm id={shift.id} label={label} />
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mb-5 text-sm text-ink-muted">
              Aucune garde prévue : les alertes urgentes vont au vétérinaire
              responsable du suivi.
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
          title="Connexions"
          description="Simulées pendant cette phase : aucun numéro WhatsApp, cabinet dr.veto ou compte bancaire réel n'est contacté."
        >
          <IntegrationList integrations={settings.integrations} />
        </SectionCard>
      </div>
    </>
  );
}
