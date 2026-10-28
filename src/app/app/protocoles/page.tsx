import { ChevronRight, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  canBrowseProtocols,
  canCreateProtocol,
} from "@/domains/protocoles/policies";
import type { ProtocolSummary } from "@/domains/protocoles/service";
import { appText } from "@/i18n/app/server";
import type { AppDictionary } from "@/i18n/app/types";
import { memberContext } from "@/server/authz";
import { services } from "@/server/services";
import { ButtonLink } from "@/ui/button";
import { Card, SectionCard } from "@/ui/card";
import { PageHeader } from "@/ui/page-header";
import { EmptyState } from "@/ui/states";

import { ValidationBadge } from "./protocol-badges";
import { InstallLibraryForm } from "./protocol-forms";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await appText();
  return { title: t.protocols.title };
}

export default async function ProtocolsPage() {
  const { t } = await appText();
  const text = t.protocols;
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
        title={text.title}
        description={text.description}
        actions={
          canCreate ? (
            <ButtonLink
              href="/app/protocoles/nouveau"
              icon={<Plus aria-hidden="true" className="size-4" />}
            >
              {text.newProtocol}
            </ButtonLink>
          ) : null
        }
      />
      <div className="grid gap-6">
        <ProtocolList
          t={t}
          title={text.lists.cabinet}
          protocols={cabinet}
          empty={text.lists.cabinetEmpty}
        />
        {canCreateProtocol(context, "personal") || mine.length > 0 ? (
          <ProtocolList
            t={t}
            title={text.lists.mine}
            description={text.lists.mineDescription}
            protocols={mine}
            empty={text.lists.mineEmpty}
          />
        ) : null}
        {colleagues.length > 0 ? (
          <ProtocolList
            t={t}
            title={text.lists.colleagues}
            protocols={colleagues}
            showOwner
            empty=""
          />
        ) : null}
        {library.length > 0 ? (
          <SectionCard
            title={text.library.title}
            description={text.library.notice}
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
                      {t.labels.protocolCategories[entry.category]} ·{" "}
                      {t.labels.species[entry.species]} · {entry.description}
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
            t={t}
            title={text.lists.archived}
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
  t,
  title,
  description,
  protocols,
  empty,
  showOwner = false,
}: {
  t: AppDictionary;
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
        <h2
          id={headingId}
          className="font-display text-xl font-semibold tracking-tight"
        >
          {title}
        </h2>
        {description ? (
          <p className="text-sm text-ink-muted">{description}</p>
        ) : null}
      </div>
      <Card bare={protocols.length > 0}>
        {protocols.length === 0 ? (
          <EmptyState title={empty} />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {protocols.map((protocol) => (
              <li key={protocol.id}>
                <Link
                  href={`/app/protocoles/${protocol.id}`}
                  className="group relative flex h-full flex-col gap-4 overflow-hidden rounded-[18px] rounded-tr-[4px] border border-line/80 bg-[linear-gradient(180deg,#fff,#fbfcf8)] p-5 shadow-[0_1px_2px_rgb(11_18_32/0.05),0_2px_0_-1px_#fff,0_4px_0_-1px_var(--color-line)] transition-all duration-300 hover:-translate-y-1 hover:rotate-[-0.4deg] hover:shadow-[0_22px_40px_-26px_var(--section-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand dark:bg-[linear-gradient(180deg,var(--color-surface),var(--color-canvas-subtle))] dark:shadow-[0_1px_2px_rgb(0_0_0/0.3),0_2px_0_-1px_var(--color-surface),0_4px_0_-1px_var(--color-line)]"
                >
                  <span
                    aria-hidden="true"
                    className="absolute top-0 right-0 size-7 bg-[linear-gradient(225deg,var(--color-canvas)_50%,color-mix(in_oklab,var(--section-glow)_70%,var(--color-surface))_50%)] shadow-[-2px_2px_4px_rgb(11_18_32/0.06)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-lg leading-snug font-semibold tracking-tight">
                      {protocol.name}
                    </span>
                    <span className="mt-1.5 block text-sm text-ink-muted">
                      {[
                        t.labels.protocolCategories[protocol.category],
                        t.labels.species[protocol.species],
                        t.protocols.lists.version(protocol.versionNumber),
                        showOwner && protocol.ownerName
                          ? t.protocols.lists.owner(protocol.ownerName)
                          : null,
                        protocol.followupCount > 0
                          ? t.protocols.lists.followups(protocol.followupCount)
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  {/* Le nom vient en premier dans le lien, pour qu'il ouvre son nom accessible. */}
                  <span className="order-first flex items-start justify-between gap-3 pr-6">
                    <span
                      aria-hidden="true"
                      className="font-display text-[2.5rem] leading-none font-semibold tracking-tight text-[var(--section-accent)]/80"
                    >
                      v{protocol.versionNumber}
                    </span>
                    <ValidationBadge validated={protocol.validated} />
                  </span>
                  <ChevronRight
                    aria-hidden="true"
                    className="absolute right-4 bottom-4 size-4 text-ink-muted transition-transform group-hover:translate-x-0.5"
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
