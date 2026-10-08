import type { Metadata } from "next";
import Link from "next/link";

import { appText } from "@/i18n/app/server";
import type { AppDictionary } from "@/i18n/app/types";
import { requirePermission } from "@/server/authz";
import { services } from "@/server/services";
import { SectionCard } from "@/ui/card";
import { formatDateTime } from "@/ui/format";
import { PageHeader } from "@/ui/page-header";
import { EmptyState } from "@/ui/states";

import { JobActions } from "./job-forms";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await appText();
  return { title: t.tasks.title };
}

/** Confirmation après une redirection (`?fait=…`). */
function doneNotice(t: AppDictionary, done: unknown): string | undefined {
  if (done === "relance") return t.tasks.done.retried;
  if (done === "abandon") return t.tasks.done.cancelled;
  return undefined;
}

/** Libellé d'un type de tâche ; un type inconnu de l'écran reste « technique ». */
function kindLabel(t: AppDictionary, kind: string): string {
  const kinds = t.tasks.kinds;
  return Object.hasOwn(kinds, kind)
    ? kinds[kind as keyof typeof kinds]
    : t.tasks.unknownKind;
}

export default async function FailedJobsPage({
  searchParams,
}: PageProps<"/app/taches">) {
  const context = await requirePermission("organization.settings");
  const [failures, { t, locale }] = await Promise.all([
    services.jobs().failures(context),
    appText(),
  ]);
  const { fait } = await searchParams;
  const done = doneNotice(t, fait);

  return (
    <>
      <PageHeader title={t.tasks.title} description={t.tasks.description} />
      {done ? (
        <p
          role="status"
          className="mb-4 rounded-[var(--radius-card)] bg-brand-soft px-4 py-3 text-sm font-medium text-brand-ink"
        >
          {done}
        </p>
      ) : null}
      <SectionCard
        title={
          failures.length ? t.tasks.count(failures.length) : t.tasks.allGood
        }
      >
        {failures.length === 0 ? (
          <EmptyState
            title={t.tasks.empty.title}
            description={t.tasks.empty.description}
          />
        ) : (
          <ul className="divide-y divide-line">
            {failures.map((job) => {
              const label = kindLabel(t, job.kind);
              return (
                <li
                  key={job.id}
                  className="grid gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[1fr_auto] sm:items-start"
                >
                  <div className="grid gap-1">
                    <p className="font-semibold">{label}</p>
                    <p className="text-sm text-urgent">
                      {t.tasks.errors[job.errorCode]}
                    </p>
                    <p className="text-sm text-ink-muted">
                      {t.tasks.attempts(
                        job.attempts,
                        formatDateTime(job.failedAt, locale),
                      )}
                    </p>
                    {job.followupId ? (
                      <p className="text-sm">
                        <Link
                          href={`/app/suivis/${job.followupId}`}
                          className="font-semibold text-brand-ink underline-offset-2 hover:underline"
                        >
                          {t.tasks.openFile}
                        </Link>
                      </p>
                    ) : null}
                  </div>
                  <JobActions id={job.id} label={label} />
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </>
  );
}
