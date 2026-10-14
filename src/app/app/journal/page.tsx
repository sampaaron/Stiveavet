import type { Metadata } from "next";

import type { AuditMetadata } from "@/domains/audit/schema";
import { appText } from "@/i18n/app/server";
import type { AppDictionary } from "@/i18n/app/types";
import { isLocale } from "@/i18n/locales";
import { requirePermission } from "@/server/authz";
import { services } from "@/server/services";
import { SectionCard } from "@/ui/card";
import { formatDateTime } from "@/ui/format";
import { PageHeader } from "@/ui/page-header";
import { EmptyState } from "@/ui/states";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await appText();
  return { title: t.journal.title };
}

type ActivityEvent = {
  action: string;
  actorMembershipId: string | null;
  actorName: string | null;
  targetName: string | null;
  metadata: AuditMetadata;
};

function hasKey<T extends object>(
  record: T,
  key: string,
): key is Extract<keyof T, string> {
  return Object.hasOwn(record, key);
}

/** Phrase du journal dans la langue de la personne. Aucun contenu clinique n'y figure. */
function sentence(t: AppDictionary, event: ActivityEvent): string {
  const text = t.journal;
  const actor = event.actorMembershipId
    ? (event.actorName ?? text.removedMember)
    : text.system;
  const member = event.targetName ?? text.someMember;
  const { action, metadata } = event;
  if (action === "membership.created")
    return !event.targetName || event.targetName === event.actorName
      ? text.joined(actor)
      : text.joinedOnInvitation(event.targetName, actor);
  if (
    action === "followup.owner_language_detected" ||
    action === "followup.owner_language_changed"
  ) {
    const owner = metadata.role === "secondary" ? "secondary" : "primary";
    const language = isLocale(metadata.language)
      ? t.labels.languages[metadata.language]
      : null;
    if (language)
      return action === "followup.owner_language_detected"
        ? text.ownerLanguageDetected(owner, language)
        : text.ownerLanguageChanged(owner, language, actor);
  }
  if (action === "followup.prepared" && metadata.source === "manual")
    return text.preparedManually(actor);
  if (hasKey(text.onMember, action))
    return text.onMember[action](actor, member);
  if (hasKey(text.byMember, action)) return text.byMember[action](actor);
  if (hasKey(text.automatic, action)) return text.automatic[action];
  return `${actor} · ${action}`;
}

export default async function ActivityPage() {
  const context = await requirePermission("activity_log.read");
  const [{ actions, logins }, { t, locale }] = await Promise.all([
    services.team().activity(context),
    appText(),
  ]);

  return (
    <>
      <PageHeader title={t.journal.title} description={t.journal.description} />
      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title={t.journal.actionsTitle}>
          {actions.length === 0 ? (
            <EmptyState title={t.journal.noActions} />
          ) : (
            <ol className="relative ml-1 border-l border-line">
              {actions.map((event) => (
                <li
                  key={event.id}
                  className="relative pb-4 pl-5 text-sm before:absolute before:top-1.5 before:-left-[4.5px] before:size-2 before:rounded-full before:bg-brand before:ring-4 before:ring-surface last:pb-0"
                >
                  <time
                    dateTime={event.occurredAt.toISOString()}
                    className="block font-mono text-xs text-ink-muted tabular-nums"
                  >
                    {formatDateTime(event.occurredAt, locale)}
                  </time>
                  <span className="mt-0.5 block min-w-0 [overflow-wrap:anywhere]">
                    {sentence(t, event)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </SectionCard>
        <SectionCard title={t.journal.loginsTitle}>
          {logins.length === 0 ? (
            <EmptyState title={t.journal.noLogins} />
          ) : (
            <ol className="relative ml-1 border-l border-line">
              {logins.map((event) => (
                <li
                  key={event.id}
                  className="relative pb-4 pl-5 text-sm before:absolute before:top-1.5 before:-left-[4.5px] before:size-2 before:rounded-full before:bg-brand before:ring-4 before:ring-surface last:pb-0"
                >
                  <time
                    dateTime={event.occurredAt.toISOString()}
                    className="block font-mono text-xs text-ink-muted tabular-nums"
                  >
                    {formatDateTime(event.occurredAt, locale)}
                  </time>
                  <span className="mt-0.5 block">
                    <span className="font-semibold">
                      {event.userId
                        ? (event.userName ?? "—")
                        : t.journal.unknownUser}
                    </span>{" "}
                    · {t.journal.logins[event.kind]}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </SectionCard>
      </div>
    </>
  );
}
