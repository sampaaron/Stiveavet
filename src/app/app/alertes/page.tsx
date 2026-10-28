import type { Metadata } from "next";

import { VET_ROLES } from "@/domains/equipe/permissions";
import { appText } from "@/i18n/app/server";
import { requirePermission } from "@/server/authz";
import { services } from "@/server/services";
import { SectionCard } from "@/ui/card";
import { PageHeader } from "@/ui/page-header";
import { SegmentedTabs } from "@/ui/segmented-tabs";
import { EmptyState } from "@/ui/states";

import { AlertCard } from "../alert-card";

import { AlertPhoneForm } from "./alert-phone-form";

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
  const { fait, vue } = await searchParams;
  const history = vue === "historique";
  const alerts = history
    ? await services.alerts().history(context)
    : await services.alerts().open(context);
  const isVet = VET_ROLES.has(context.role);
  const alertPhone = isVet
    ? await services.alerts().myAlertPhone(context)
    : null;
  const { t } = await appText();
  const text = t.alerts;
  const done =
    typeof fait === "string" && Object.hasOwn(text.done, fait)
      ? text.done[fait as keyof typeof text.done]
      : undefined;
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
      <SegmentedTabs
        label={text.views.label}
        className="mb-6"
        tabs={[
          { href: "/app/alertes", label: text.views.open, active: !history },
          {
            href: "/app/alertes?vue=historique",
            label: text.views.history,
            active: history,
          },
        ]}
      />
      {history ? (
        <SectionCard
          title={text.history.section}
          description={text.history.description}
        >
          {alerts.length === 0 ? (
            <EmptyState
              title={text.history.emptyTitle}
              description={text.history.emptyDescription}
            />
          ) : (
            <ul className="grid gap-3">
              {alerts.map((alert) => (
                <li key={alert.id}>
                  <AlertCard alert={alert} from="alertes" />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      ) : alerts.length === 0 ? (
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
                  className="mb-3 flex items-center gap-3 font-display text-xl font-semibold tracking-tight"
                >
                  <span
                    aria-hidden="true"
                    className={`size-2.5 rounded-full ${group.id === "urgences" ? "bg-urgent shadow-[0_0_0_4px_var(--color-urgent-soft)]" : "bg-watch shadow-[0_0_0_4px_var(--color-watch-soft)]"}`}
                  />
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
      {isVet && !history ? (
        <div className="mt-6">
          <SectionCard
            title={text.phone.title}
            description={text.phone.description}
          >
            <p className="mb-3 text-sm">
              {alertPhone ? text.phone.current(alertPhone) : text.phone.none}
            </p>
            <AlertPhoneForm />
          </SectionCard>
        </div>
      ) : null}
    </>
  );
}
