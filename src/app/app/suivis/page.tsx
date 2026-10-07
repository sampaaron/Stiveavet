import { ChevronRight, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { requirePermission } from "@/server/authz";
import { services } from "@/server/services";
import { Card } from "@/ui/card";
import { SpeciesIcon } from "@/ui/followup-card";
import { formatDate } from "@/ui/format";
import { PageHeader } from "@/ui/page-header";
import { EmptyState } from "@/ui/states";
import { StatusBadge } from "@/ui/status-badge";

import { FOLLOWUP_STATUS_LABELS, followupBadge } from "./followup-labels";
import { TestMark } from "./test-mark";

export const metadata: Metadata = { title: "Suivis" };

export default async function FollowupsPage() {
  const context = await requirePermission(
    "followups.read_all",
    "followups.read_own",
    "followups.read_summary",
  );
  const followups = await services.followups().list(context);
  const clinical = context.permissions.has("clinical.read");

  return (
    <>
      <PageHeader
        title="Suivis"
        description={
          clinical
            ? "Les suivis que vous pouvez consulter."
            : "Vue d'organisation : animal, propriétaire, état et responsable. Les données cliniques sont réservées aux vétérinaires."
        }
      />
      <Card>
        {followups.length === 0 ? (
          <EmptyState
            title="Aucun suivi à afficher"
            description="Les suivis dont vous êtes responsable ou qui vous sont partagés apparaîtront ici."
          />
        ) : (
          <ul className="divide-y divide-line">
            {followups.map((followup) => {
              const badge = followupBadge(followup);
              return (
                <li key={followup.id}>
                  <Link
                    href={`/app/suivis/${followup.id}`}
                    className="flex items-center gap-4 px-5 py-4 hover:bg-canvas-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-canvas-subtle text-ink-muted">
                      <SpeciesIcon
                        species={followup.species === "cat" ? "chat" : "chien"}
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">
                          {followup.animalName}
                        </span>
                        {badge ? <StatusBadge status={badge} /> : null}
                        {followup.isPrivate ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink-muted">
                            <Lock aria-hidden="true" className="size-3.5" />
                            Privé
                          </span>
                        ) : null}
                        {followup.isTest ? <TestMark /> : null}
                      </span>
                      <span className="mt-0.5 block truncate text-sm text-ink-muted">
                        {[
                          followup.ownerName,
                          followup.access === "clinical"
                            ? followup.procedure
                            : null,
                          FOLLOWUP_STATUS_LABELS[followup.status],
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className="hidden shrink-0 text-right text-sm text-ink-muted sm:block">
                      <span className="block">{followup.responsibleName}</span>
                      <span className="block">
                        {followup.controlAppointmentAt
                          ? `Contrôle le ${formatDate(followup.controlAppointmentAt)}`
                          : "Contrôle non programmé"}
                      </span>
                    </span>
                    <ChevronRight
                      aria-hidden="true"
                      className="size-4 shrink-0 text-ink-muted"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
