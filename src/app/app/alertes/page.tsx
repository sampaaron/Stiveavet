import type { Metadata } from "next";

import { appText } from "@/i18n/app/server";
import { requirePermission } from "@/server/authz";
import { services } from "@/server/services";
import { SectionCard } from "@/ui/card";
import { PageHeader } from "@/ui/page-header";
import { EmptyState } from "@/ui/states";

import { AlertCard } from "../alert-card";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await appText();
  return { title: t.alerts.title };
}

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
  const { t } = await appText();
  const text = t.alerts;
  const done =
    fait === "recue" || fait === "close" ? text.done[fait] : undefined;
  const urgent = alerts.filter((alert) => alert.level === "urgent");
  const watch = alerts.filter((alert) => alert.level === "watch");

  return (
    <>
      <PageHeader title={text.title} description={text.description} />
      {done ? (
        <p
          role="status"
          className="mb-4 rounded-[var(--radius-card)] bg-brand-soft px-4 py-3 text-sm font-medium text-brand-ink"
        >
          {done}
        </p>
      ) : null}
      {alerts.length === 0 ? (
        <SectionCard title={text.empty.section}>
          <EmptyState
            title={text.empty.title}
            description={text.empty.description}
          />
        </SectionCard>
      ) : (
        <div className="grid gap-6">
          {[
            { id: "urgences", title: text.groups.urgent, items: urgent },
            { id: "a-surveiller", title: text.groups.watch, items: watch },
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
