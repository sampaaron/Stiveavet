import type { Metadata } from "next";
import Link from "next/link";

import { VET_ROLES } from "@/domains/equipe/permissions";
import { appText } from "@/i18n/app/server";
import { requirePermission } from "@/server/authz";
import { services } from "@/server/services";
import { SectionCard } from "@/ui/card";
import { PageHeader } from "@/ui/page-header";
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
    fait === "recue" || fait === "close" || fait === "confiee"
      ? text.done[fait]
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
      <nav
        aria-label={text.views.label}
        className="mb-5 inline-flex gap-1 rounded-[var(--radius-control)] border border-line bg-surface p-1 shadow-[var(--shadow-card)]"
      >
        {[
          { href: "/app/alertes", label: text.views.open, active: !history },
          {
            href: "/app/alertes?vue=historique",
            label: text.views.history,
            active: history,
          },
        ].map((view) => (
          <Link
            key={view.href}
            href={view.href}
            aria-current={view.active ? "page" : undefined}
            className={
              view.active
                ? "inline-flex min-h-10 items-center rounded-[7px] bg-chrome px-4 text-sm font-semibold text-white"
                : "inline-flex min-h-10 items-center rounded-[7px] px-4 text-sm font-semibold text-ink-muted hover:bg-canvas-subtle hover:text-ink"
            }
          >
            {view.label}
          </Link>
        ))}
      </nav>
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
                  className="mb-3 flex items-center gap-2.5 text-base font-bold tracking-tight"
                >
                  <span
                    aria-hidden="true"
                    className={
                      group.id === "urgences"
                        ? "size-2 rounded-full bg-urgent"
                        : "size-2 rounded-full bg-watch"
                    }
                  />
                  {group.title}{" "}
                  <span className="font-mono text-sm font-semibold text-ink-muted tabular-nums">
                    ({group.items.length})
                  </span>
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
