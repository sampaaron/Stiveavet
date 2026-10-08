import { CalendarClock, EyeOff, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import type { FreeSlotView } from "@/domains/agenda/captures";
import type { AppointmentDesk } from "@/domains/agenda/demandes";
import { appText } from "@/i18n/app/server";
import type { AppDictionary } from "@/i18n/app/types";
import type { Locale } from "@/i18n/locales";
import { requirePermission } from "@/server/authz";
import { services } from "@/server/services";
import { AlertBanner } from "@/ui/alert-banner";
import { SectionCard } from "@/ui/card";
import { formatDate, formatDateTime, formatTime } from "@/ui/format";
import { PageHeader } from "@/ui/page-header";
import { EmptyState } from "@/ui/states";

import {
  AppointmentDecision,
  CallbackDoneButton,
  CaptureForm,
  RemoveSlotButton,
} from "./agenda-forms";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await appText();
  return { title: t.agenda.title };
}

/** Confirmations simples, par valeur de `?fait=` (la capture a son propre message). */
const DONE_KEYS = ["retire", "confirme", "refuse", "rappele"] as const;
type DoneKey = (typeof DONE_KEYS)[number];
const isDoneKey = (value: unknown): value is DoneKey =>
  DONE_KEYS.some((key) => key === value);

/**
 * Agenda (cahier des charges §8) : en attendant les intégrations (dr.veto en phase 3), le
 * cabinet envoie une capture d'écran de son agenda ; Stivea Vet en lit les créneaux libres
 * puis supprime la capture. Numa ne fera que proposer ces créneaux, le cabinet confirme.
 */
export default async function AgendaPage({
  searchParams,
}: PageProps<"/app/agenda">) {
  const context = await requirePermission("agenda.read");
  const canCapture = context.permissions.has("agenda.capture");
  const [desk, slots, vets, captures] = await Promise.all([
    services.appointments().desk(context),
    services.agenda().freeSlots(context),
    canCapture ? services.agenda().vets(context) : Promise.resolve([]),
    canCapture
      ? services.agenda().recentCaptures(context)
      : Promise.resolve([]),
  ]);
  const { t, locale } = await appText();
  const { fait, creneaux } = await searchParams;
  const done =
    fait === "capture" &&
    typeof creneaux === "string" &&
    /^\d{1,2}$/.test(creneaux)
      ? t.agenda.done.capture(Number(creneaux))
      : isDoneKey(fait)
        ? t.agenda.done[fait]
        : undefined;
  const days = groupByDay(slots, locale);

  return (
    <>
      <PageHeader title={t.agenda.title} description={t.agenda.description} />
      {done ? (
        <p
          role="status"
          className="mb-4 rounded-[var(--radius-card)] bg-brand-soft px-4 py-3 text-sm font-medium text-brand-ink"
        >
          {done}
        </p>
      ) : null}

      <AppointmentRequests desk={desk} t={t} locale={locale} />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <SectionCard
          title={t.agenda.slots.title}
          description={t.agenda.slots.description}
        >
          {days.length === 0 ? (
            <EmptyState
              title={t.agenda.slots.emptyTitle}
              description={t.agenda.slots.emptyDescription}
            />
          ) : (
            <div className="grid gap-5">
              {days.map(({ day, items }) => (
                <section key={day} aria-label={day}>
                  <h3 className="mb-2 text-sm font-semibold text-ink-muted">
                    {day}
                  </h3>
                  <ul
                    className="grid gap-2"
                    aria-label={t.agenda.slots.dayListLabel(day)}
                  >
                    {items.map((slot) => {
                      const start = formatTime(slot.startsAt, locale);
                      const end = formatTime(slot.endsAt, locale);
                      return (
                        <li
                          key={slot.id}
                          className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-line px-3 py-2"
                        >
                          <span className="flex min-w-0 items-center gap-2 text-sm">
                            <CalendarClock
                              aria-hidden="true"
                              className="size-4 shrink-0 text-brand"
                            />
                            <span className="font-semibold">
                              {start} – {end}
                            </span>
                            <span className="truncate text-ink-muted">
                              {slot.vetName}
                            </span>
                          </span>
                          {canCapture ? (
                            <RemoveSlotButton
                              slotId={slot.id}
                              label={t.agenda.slots.removeLabel(
                                day,
                                start,
                                end,
                                slot.vetName,
                              )}
                            />
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </SectionCard>

        {canCapture ? (
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4">
            <SectionCard
              title={t.agenda.capture.title}
              description={t.agenda.capture.description}
            >
              <AlertBanner tone="info" title={t.agenda.capture.beforeTitle}>
                <span className="flex items-start gap-2">
                  <EyeOff
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0"
                  />
                  {t.agenda.capture.beforeText}
                </span>
              </AlertBanner>
              <div className="mt-4">
                <CaptureForm
                  vets={vets}
                  defaultVet={
                    vets.find(
                      (vet) => vet.membershipId === context.membershipId,
                    )?.membershipId ?? vets[0]?.membershipId
                  }
                />
              </div>
            </SectionCard>
            {captures.length ? (
              <SectionCard
                title={t.agenda.recentCaptures.title}
                description={t.agenda.recentCaptures.description}
                headingLevel={2}
              >
                <ul
                  className="grid gap-2 text-sm"
                  aria-label={t.agenda.recentCaptures.title}
                >
                  {captures.map((capture) => (
                    <li
                      key={capture.createdAt.toISOString()}
                      className="flex items-start gap-2"
                    >
                      <Trash2
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0 text-ink-muted"
                      />
                      <span>
                        {t.agenda.recentCaptures.received(
                          formatDateTime(capture.createdAt, locale),
                        )}
                        {capture.deletedAt
                          ? t.agenda.recentCaptures.deleted(
                              formatDateTime(capture.deletedAt, locale),
                            )
                          : t.agenda.recentCaptures.deleting}
                      </span>
                    </li>
                  ))}
                </ul>
              </SectionCard>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}

/** Demandes faites à Numa : créneaux choisis à confirmer, demandes sans créneau à rappeler. */
function AppointmentRequests({
  desk,
  t,
  locale,
}: {
  desk: AppointmentDesk;
  t: AppDictionary;
  locale: Locale;
}) {
  if (desk.pending.length === 0 && desk.callbacks.length === 0) return null;
  return (
    <div className="mb-6 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
      <SectionCard
        title={t.agenda.pending.title}
        description={
          desk.canConfirm
            ? t.agenda.pending.descriptionCanConfirm
            : t.agenda.pending.descriptionReadOnly
        }
      >
        {desk.pending.length === 0 ? (
          <p className="text-sm text-ink-muted">{t.agenda.pending.empty}</p>
        ) : (
          <ul className="grid gap-3" aria-label={t.agenda.pending.title}>
            {desk.pending.map((item) => {
              const when = formatDateTime(item.startsAt, locale);
              return (
                <li
                  key={item.id}
                  className="grid gap-2 rounded-[var(--radius-control)] border border-line p-3 text-sm"
                >
                  <span>
                    <Link
                      href={`/app/suivis/${item.followupId}`}
                      className="font-semibold text-brand-ink underline-offset-2 hover:underline"
                    >
                      {item.animalName}
                    </Link>{" "}
                    · {t.labels.appointmentKinds[item.kind]}
                    <span className="block text-ink-muted">
                      {when} – {formatTime(item.endsAt, locale)}{" "}
                      {t.agenda.pending.withVet(item.vetName)}
                    </span>
                  </span>
                  {desk.canConfirm ? (
                    <AppointmentDecision
                      appointmentId={item.id}
                      animalName={item.animalName}
                      when={when}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
      <SectionCard
        title={t.agenda.callbacks.title}
        description={t.agenda.callbacks.description}
      >
        {desk.callbacks.length === 0 ? (
          <p className="text-sm text-ink-muted">{t.agenda.callbacks.empty}</p>
        ) : (
          <ul className="grid gap-3" aria-label={t.agenda.callbacks.title}>
            {desk.callbacks.map((item) => {
              const requestedAt = formatDateTime(item.requestedAt, locale);
              return (
                <li
                  key={item.id}
                  className="grid gap-2 rounded-[var(--radius-control)] border border-line p-3 text-sm"
                >
                  <span>
                    <Link
                      href={`/app/suivis/${item.followupId}`}
                      className="font-semibold text-brand-ink underline-offset-2 hover:underline"
                    >
                      {item.animalName}
                    </Link>{" "}
                    · {t.labels.appointmentKinds[item.kind]}
                    <span className="block text-ink-muted">
                      {t.agenda.callbacks.requested(requestedAt)} ·{" "}
                      {item.vetName}
                    </span>
                  </span>
                  {desk.canConfirm ? (
                    <CallbackDoneButton
                      requestId={item.id}
                      animalName={item.animalName}
                      requestedAt={requestedAt}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

function groupByDay(
  slots: FreeSlotView[],
  locale: Locale,
): { day: string; items: FreeSlotView[] }[] {
  const days: { day: string; items: FreeSlotView[] }[] = [];
  for (const slot of slots) {
    const day = formatDate(slot.startsAt, locale);
    const last = days.at(-1);
    if (last?.day === day) last.items.push(slot);
    else days.push({ day, items: [slot] });
  }
  return days;
}
