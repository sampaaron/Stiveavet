import { ChevronRight, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CATEGORY_LABELS, SPECIES_LABELS } from "@/domains/protocoles/content";
import { LIBRARY_NOTICE } from "@/domains/protocoles/library";
import {
  canBrowseProtocols,
  canCreateProtocol,
} from "@/domains/protocoles/policies";
import type { ProtocolSummary } from "@/domains/protocoles/service";
import { memberContext } from "@/server/authz";
import { services } from "@/server/services";
import { ButtonLink } from "@/ui/button";
import { Card, SectionCard } from "@/ui/card";
import { PageHeader } from "@/ui/page-header";
import { EmptyState } from "@/ui/states";

import { ValidationBadge } from "./protocol-badges";
import { InstallLibraryForm } from "./protocol-forms";

export const metadata: Metadata = { title: "Protocoles" };

export default async function ProtocolsPage() {
  const context = await memberContext();
  if (!canBrowseProtocols(context)) notFound();
  const { protocols, library } = await services.protocols().list(context);

  const active = protocols.filter((protocol) => !protocol.archived);
  const cabinet = active.filter((p) => p.ownerMembershipId === null);
  const mine = active.filter(
    (p) => p.ownerMembershipId === context.membershipId,
  );
  const colleagues = active.filter(
    (p) =>
      p.ownerMembershipId !== null &&
      p.ownerMembershipId !== context.membershipId,
  );
  const archived = protocols.filter((protocol) => protocol.archived);
  const canCreate =
    canCreateProtocol(context, "cabinet") ||
    canCreateProtocol(context, "personal");

  return (
    <>
      <PageHeader
        title="Protocoles"
        description="Chaque modification crée une nouvelle version : un suivi déjà lancé garde toujours la sienne."
        actions={
          canCreate ? (
            <ButtonLink
              href="/app/protocoles/nouveau"
              icon={<Plus aria-hidden="true" className="size-4" />}
            >
              Nouveau protocole
            </ButtonLink>
          ) : null
        }
      />
      <div className="grid gap-6">
        <ProtocolList
          title="Protocoles du cabinet"
          protocols={cabinet}
          empty="Aucun protocole du cabinet pour l'instant."
        />
        {canCreateProtocol(context, "personal") || mine.length > 0 ? (
          <ProtocolList
            title="Mes protocoles"
            description="Visibles par vous seul, et par les personnes qui gèrent les protocoles du cabinet."
            protocols={mine}
            empty="Vous n'avez pas encore de protocole personnel. Dupliquez un protocole du cabinet pour l'adapter."
          />
        ) : null}
        {colleagues.length > 0 ? (
          <ProtocolList
            title="Protocoles personnels des confrères"
            protocols={colleagues}
            showOwner
            empty=""
          />
        ) : null}
        {library.length > 0 ? (
          <SectionCard
            title="Bibliothèque de départ"
            description={LIBRARY_NOTICE}
          >
            <ul className="grid gap-4">
              {library.map((entry) => (
                <li
                  key={entry.key}
                  className="flex flex-wrap items-start justify-between gap-3 text-sm"
                >
                  <span className="min-w-0">
                    <span className="block font-semibold">{entry.name}</span>
                    <span className="block text-ink-muted">
                      {CATEGORY_LABELS[entry.category]} ·{" "}
                      {SPECIES_LABELS[entry.species]} · {entry.description}
                    </span>
                  </span>
                  <InstallLibraryForm
                    libraryKey={entry.key}
                    name={entry.name}
                  />
                </li>
              ))}
            </ul>
          </SectionCard>
        ) : null}
        {archived.length > 0 ? (
          <ProtocolList
            title="Archivés"
            protocols={archived}
            showOwner
            empty=""
          />
        ) : null}
      </div>
    </>
  );
}

function ProtocolList({
  title,
  description,
  protocols,
  empty,
  showOwner = false,
}: {
  title: string;
  description?: string;
  protocols: ProtocolSummary[];
  empty: string;
  showOwner?: boolean;
}) {
  const headingId = `liste-${title
    .normalize("NFD")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .toLowerCase()}`;
  return (
    <section aria-labelledby={headingId} className="grid gap-3">
      <div>
        <h2 id={headingId} className="text-lg font-bold tracking-tight">
          {title}
        </h2>
        {description ? (
          <p className="text-sm text-ink-muted">{description}</p>
        ) : null}
      </div>
      <Card>
        {protocols.length === 0 ? (
          <EmptyState title={empty} />
        ) : (
          <ul className="divide-y divide-line">
            {protocols.map((protocol) => (
              <li key={protocol.id}>
                <Link
                  href={`/app/protocoles/${protocol.id}`}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-canvas-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{protocol.name}</span>
                      <ValidationBadge validated={protocol.validated} />
                    </span>
                    <span className="mt-0.5 block text-sm text-ink-muted">
                      {[
                        CATEGORY_LABELS[protocol.category],
                        SPECIES_LABELS[protocol.species],
                        `version ${protocol.versionNumber}`,
                        showOwner && protocol.ownerName
                          ? `de ${protocol.ownerName}`
                          : null,
                        protocol.followupCount > 0
                          ? `${protocol.followupCount} suivi(s)`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <ChevronRight
                    aria-hidden="true"
                    className="size-4 shrink-0 text-ink-muted"
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
