import type { Metadata } from "next";

import { requirePermission } from "@/server/authz";
import { services } from "@/server/services";
import { SectionCard } from "@/ui/card";
import { PageHeader } from "@/ui/page-header";
import { EmptyState } from "@/ui/states";

import { AlertCard } from "../alert-card";

export const metadata: Metadata = { title: "Alertes" };

const DONE: Record<string, string> = {
  recue: "Réception confirmée : l'escalade est annulée.",
  close: "Alerte close.",
};

/**
 * Alertes non closes des dossiers que la personne peut lire en clinique (ADR 0017).
 * Les urgences d'abord, puis les signes à surveiller, des plus récentes aux plus anciennes.
 */
export default async function AlertsPage({
  searchParams,
}: PageProps<"/app/alertes">) {
  const context = await requirePermission("clinical.read");
  const alerts = await services.alerts().open(context);
  const { fait } = await searchParams;
  const done = typeof fait === "string" ? DONE[fait] : undefined;
  const urgent = alerts.filter((alert) => alert.level === "urgent");
  const watch = alerts.filter((alert) => alert.level === "watch");

  return (
    <>
      <PageHeader
        title="Alertes"
        description="Messages de propriétaires classés urgents ou à surveiller par les règles du triage. Numa ne pose aucun diagnostic : chaque alerte attend la décision d'un vétérinaire."
      />
      {done ? (
        <p
          role="status"
          className="mb-4 rounded-[var(--radius-card)] bg-brand-soft px-4 py-3 text-sm font-medium text-brand-ink"
        >
          {done}
        </p>
      ) : null}
      {alerts.length === 0 ? (
        <SectionCard title="Aucune alerte en cours">
          <EmptyState
            title="Rien à traiter"
            description="Les urgences et les signes à surveiller signalés par les propriétaires apparaîtront ici."
          />
        </SectionCard>
      ) : (
        <div className="grid gap-6">
          {[
            { id: "urgences", title: "Urgences", items: urgent },
            { id: "a-surveiller", title: "À surveiller", items: watch },
          ]
            .filter((group) => group.items.length)
            .map((group) => (
              <section key={group.id} aria-labelledby={`alertes-${group.id}`}>
                <h2
                  id={`alertes-${group.id}`}
                  className="mb-3 text-lg font-semibold"
                >
                  {group.title} ({group.items.length})
                </h2>
                <ul className="grid gap-3">
                  {group.items.map((alert) => (
                    <li key={alert.id}>
                      <AlertCard alert={alert} from="alertes" />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
        </div>
      )}
    </>
  );
}
