import { ClipboardPen, LockKeyhole, MessageSquareText } from "lucide-react";
import type { Metadata } from "next";

import type { StiveProposalView } from "@/domains/stive/service";
import { appText } from "@/i18n/app/server";
import { requirePermission } from "@/server/authz";
import { services } from "@/server/services";
import { AiBadge } from "@/ui/assistant-card";
import { ButtonLink } from "@/ui/button";
import { Card } from "@/ui/card";
import { cn } from "@/ui/cn";
import { formatRelativeMoment } from "@/ui/format";
import { PageHeader } from "@/ui/page-header";
import { EmptyState } from "@/ui/states";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await appText();
  return { title: t.hub.contents.title };
}

const STATUS_CLASSES: Record<StiveProposalView["status"], string> = {
  open: "bg-watch-soft text-watch",
  done: "bg-brand-soft text-brand-ink",
  expired: "bg-canvas-subtle text-ink-muted",
};

/**
 * Contenus (ADR 0044) : les brouillons de messages que Stive a rédigés pour la personne,
 * repris de sa propre conversation (30 jours, visible d'elle seule). Un brouillon ne part
 * jamais d'ici : il se reprend dans le dossier, où la personne le relit et l'envoie.
 */
export default async function ContentsPage() {
  const context = await requirePermission("stive.use");
  const [{ t, locale }, conversation] = await Promise.all([
    appText(),
    services.stive().conversation(context),
  ]);
  const text = t.hub.contents;
  const now = new Date();
  const drafts = conversation.entries
    .flatMap((entry) =>
      entry.author === "stive" && entry.answer?.kind === "draft"
        ? [{ id: entry.id, at: entry.at, answer: entry.answer }]
        : [],
    )
    .reverse();

  return (
    <>
      <PageHeader title={text.title} description={text.description} />
      <p className="mb-6 flex items-start gap-2 text-sm text-ink-muted">
        <LockKeyhole
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-brand"
        />
        {text.privacy}
      </p>
      {drafts.length === 0 ? (
        <Card>
          <EmptyState
            title={text.empty.title}
            description={text.empty.description}
            action={
              <ButtonLink href="/app/raccourcis" variant="secondary">
                {text.empty.action}
              </ButtonLink>
            }
          />
        </Card>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {drafts.map(({ id, at, answer }) => {
            const proposal = conversation.proposals[answer.proposalId];
            const status = proposal?.status ?? "expired";
            return (
              <li key={id}>
                <Card className="flex h-full flex-col gap-3 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                        STATUS_CLASSES[status],
                      )}
                    >
                      {text.status[status]}
                    </span>
                    <span className="flex items-center gap-2 text-xs text-ink-muted">
                      <AiBadge assistant="stive" />
                      {text.createdAt(formatRelativeMoment(at, now, locale))}
                    </span>
                  </div>
                  <h2 className="font-semibold">
                    {text.draftTitle(
                      t.common.list(answer.recipients),
                      answer.followup.animalName,
                    )}
                  </h2>
                  {proposal?.draft ? (
                    <blockquote className="flex gap-2 rounded-[var(--radius-control)] border border-line bg-canvas/60 p-3 text-sm">
                      <MessageSquareText
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0 text-brand"
                      />
                      <p className="whitespace-pre-line">{proposal.draft}</p>
                    </blockquote>
                  ) : null}
                  {status === "open" ? (
                    <div className="mt-auto">
                      <ButtonLink
                        href={`/app/suivis/${answer.followup.id}?brouillon=${answer.proposalId}#conversation`}
                        size="sm"
                        icon={
                          <ClipboardPen aria-hidden="true" className="size-4" />
                        }
                      >
                        {text.use}
                      </ButtonLink>
                    </div>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
