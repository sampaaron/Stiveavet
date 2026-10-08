import { CalendarClock, EyeOff, Trash2 } from "lucide-react";
import type { Metadata } from "next";

import type { FreeSlotView } from "@/domains/agenda/captures";
import { requirePermission } from "@/server/authz";
import { services } from "@/server/services";
import { AlertBanner } from "@/ui/alert-banner";
import { SectionCard } from "@/ui/card";
import { formatDate, formatDateTime, formatTime } from "@/ui/format";
import { PageHeader } from "@/ui/page-header";
import { EmptyState } from "@/ui/states";

import { CaptureForm, RemoveSlotButton } from "./agenda-forms";

export const metadata: Metadata = { title: "Agenda" };

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
  const [slots, vets, captures] = await Promise.all([
    services.agenda().freeSlots(context),
    canCapture ? services.agenda().vets(context) : Promise.resolve([]),
    canCapture
      ? services.agenda().recentCaptures(context)
      : Promise.resolve([]),
  ]);
  const { fait, creneaux } = await searchParams;
  const done =
    fait === "capture" &&
    typeof creneaux === "string" &&
    /^\d{1,2}$/.test(creneaux)
      ? `Capture lue : ${creneaux} créneaux libres enregistrés. Le fichier a été supprimé.`
      : fait === "retire"
        ? "Créneau retiré."
        : undefined;
  const days = groupByDay(slots);

  return (
    <>
      <PageHeader
        title="Agenda"
        description="Créneaux libres que Numa pourra proposer aux propriétaires. Chaque rendez-vous reste confirmé par le cabinet."
      />
      {done ? (
        <p
          role="status"
          className="mb-4 rounded-[var(--radius-card)] bg-brand-soft px-4 py-3 text-sm font-medium text-brand-ink"
        >
          {done}
        </p>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <SectionCard
          title="Créneaux libres à venir"
          description="Lus sur les captures d'agenda. Lecture simulée dans cette version."
        >
          {days.length === 0 ? (
            <EmptyState
              title="Aucun créneau libre enregistré"
              description="Envoyez une capture d'écran de l'agenda : ses créneaux libres apparaîtront ici."
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
                    aria-label={`Créneaux libres du ${day}`}
                  >
                    {items.map((slot) => {
                      const label = `${formatTime(slot.startsAt)} à ${formatTime(slot.endsAt)}, ${slot.vetName}`;
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
                              {formatTime(slot.startsAt)} –{" "}
                              {formatTime(slot.endsAt)}
                            </span>
                            <span className="truncate text-ink-muted">
                              {slot.vetName}
                            </span>
                          </span>
                          {canCapture ? (
                            <RemoveSlotButton
                              slotId={slot.id}
                              label={`du ${day}, ${label}`}
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
              title="Envoyer une capture d'agenda"
              description="En attendant la connexion directe à l'agenda (dr.veto)."
            >
              <AlertBanner tone="info" title="Avant d'envoyer">
                <span className="flex items-start gap-2">
                  <EyeOff
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0"
                  />
                  Masquez les noms, motifs et toute information inutile : ne
                  laissez visibles que les créneaux libres. La capture est
                  supprimée dès la lecture des créneaux.
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
                title="Dernières captures"
                description="Aucune capture n'est gardée : seule la trace de sa suppression reste."
                headingLevel={2}
              >
                <ul
                  className="grid gap-2 text-sm"
                  aria-label="Dernières captures"
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
                        Reçue le {formatDateTime(capture.createdAt)}
                        {capture.deletedAt
                          ? `, supprimée le ${formatDateTime(capture.deletedAt)}`
                          : ", suppression en cours"}
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

function groupByDay(
  slots: FreeSlotView[],
): { day: string; items: FreeSlotView[] }[] {
  const days: { day: string; items: FreeSlotView[] }[] = [];
  for (const slot of slots) {
    const day = formatDate(slot.startsAt);
    const last = days.at(-1);
    if (last?.day === day) last.items.push(slot);
    else days.push({ day, items: [slot] });
  }
  return days;
}
