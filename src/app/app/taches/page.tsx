import type { Metadata } from "next";
import Link from "next/link";

import { requirePermission } from "@/server/authz";
import { services } from "@/server/services";
import { SectionCard } from "@/ui/card";
import { formatDateTime } from "@/ui/format";
import { PageHeader } from "@/ui/page-header";
import { EmptyState } from "@/ui/states";

import { JobActions } from "./job-forms";

export const metadata: Metadata = { title: "Tâches en échec" };

const DONE: Record<string, string> = {
  relance: "Tâche relancée : le worker la reprend dans un instant.",
  abandon: "Tâche abandonnée : elle ne sera plus tentée.",
};

export default async function FailedJobsPage({
  searchParams,
}: PageProps<"/app/taches">) {
  const context = await requirePermission("organization.settings");
  const failures = await services.jobs().failures(context);
  const { fait } = await searchParams;
  const done = typeof fait === "string" ? DONE[fait] : undefined;

  return (
    <>
      <PageHeader
        title="Tâches en échec"
        description="Envois, rappels et alertes que Stivea Vet n'a pas pu mener à bien après plusieurs tentatives espacées. Relancez-les une fois la cause réglée, ou abandonnez-les."
      />
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
          failures.length
            ? `${failures.length} tâche${failures.length > 1 ? "s" : ""} en échec`
            : "Tout fonctionne"
        }
      >
        {failures.length === 0 ? (
          <EmptyState
            title="Aucune tâche en échec"
            description="Les envois et rappels en difficulté apparaîtront ici après leur dernière tentative."
          />
        ) : (
          <ul className="divide-y divide-line">
            {failures.map((job) => (
              <li
                key={job.id}
                className="grid gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[1fr_auto] sm:items-start"
              >
                <div className="grid gap-1">
                  <p className="font-semibold">{job.label}</p>
                  <p className="text-sm text-urgent">{job.errorLabel}</p>
                  <p className="text-sm text-ink-muted">
                    {job.attempts} tentative{job.attempts > 1 ? "s" : ""} ·
                    dernier échec le {formatDateTime(job.failedAt)}
                  </p>
                  {job.followupId ? (
                    <p className="text-sm">
                      <Link
                        href={`/app/suivis/${job.followupId}`}
                        className="font-semibold text-brand-ink underline-offset-2 hover:underline"
                      >
                        Ouvrir le dossier
                      </Link>
                    </p>
                  ) : null}
                </div>
                <JobActions id={job.id} label={job.label} />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );
}
