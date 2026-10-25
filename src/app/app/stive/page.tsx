import { MessageSquarePlus, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import type { FollowupView } from "@/domains/suivis/service";
import { appText } from "@/i18n/app/server";
import type { AppDictionary } from "@/i18n/app/types";
import { memberProfile } from "@/server/auth/profile";
import { requirePermission } from "@/server/authz";
import { services } from "@/server/services";
import { AlertBanner } from "@/ui/alert-banner";
import { AiBadge, AssistantAvatar } from "@/ui/assistant-card";
import { ButtonLink } from "@/ui/button";
import { Card } from "@/ui/card";
import { cn } from "@/ui/cn";
import { formatRelativeMoment } from "@/ui/format";
import { PageHeader } from "@/ui/page-header";

import { DeleteConversationButton, StiveChat } from "./stive-chat";
import type { StiveFollowupOption } from "./stive-chat";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await appText();
  return { title: t.stive.title };
}

const STATUS_ORDER: Record<FollowupView["status"], number> = {
  active: 0,
  human_takeover: 0,
  paused: 1,
  draft: 2,
  ended: 3,
};

/** Dossiers que la personne peut évoquer : les siens et ceux qu'elle lit, actifs d'abord. */
function followupOptions(
  t: AppDictionary,
  followups: FollowupView[],
): StiveFollowupOption[] {
  return [...followups]
    .sort(
      (a, b) =>
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
        a.animalName.localeCompare(b.animalName),
    )
    .slice(0, 150)
    .map((followup) => ({
      value: followup.id,
      label: t.stive.followup.option(
        followup.animalName,
        followup.access === "clinical"
          ? followup.procedure
          : t.labels.followupStatus[followup.status],
      ),
    }));
}

/**
 * Stive, l'assistant IA du vétérinaire (ADR 0035) : conversation libre, appuyée au besoin
 * sur un dossier du cabinet que la personne peut lire. Sans `stive.use`, l'écran n'existe pas.
 */
export default async function StivePage({
  searchParams,
}: PageProps<"/app/stive">) {
  const context = await requirePermission("stive.use");
  const { c, fait, ambigu } = await searchParams;
  const conversationId = typeof c === "string" ? c : null;
  const stive = services.stive();
  const [conversations, conversation, followups, profile, { t, locale }] =
    await Promise.all([
      stive.conversations(context),
      conversationId ? stive.conversation(context, conversationId) : null,
      services.followups().list(context),
      memberProfile(context),
      appText(),
    ]);
  if (conversationId && !conversation) notFound();
  const text = t.stive;
  const now = new Date();
  const animalOf = new Map(
    followups.map((followup) => [followup.id, followup.animalName]),
  );
  const visibleFollowup =
    conversation?.followupId && animalOf.has(conversation.followupId)
      ? conversation.followupId
      : null;

  return (
    <>
      <PageHeader
        eyebrow={text.eyebrow}
        title={text.title}
        description={text.description}
        actions={
          conversation ? (
            <ButtonLink
              href="/app/stive"
              variant="secondary"
              icon={<MessageSquarePlus aria-hidden="true" className="size-4" />}
            >
              {text.newConversation}
            </ButtonLink>
          ) : null
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_17rem]">
        <section
          aria-labelledby="stive-fil"
          className="flex min-w-0 flex-col gap-4"
        >
          <div className="flex flex-wrap items-center gap-3">
            <AssistantAvatar
              assistant="stive"
              size={48}
              className="size-12 ring-4 ring-brand-soft"
            />
            <h2
              id="stive-fil"
              className="flex min-w-0 flex-wrap items-center gap-2 font-bold"
            >
              {conversation?.title ?? text.newConversation}
              <AiBadge assistant="stive" />
            </h2>
          </div>
          <AlertBanner compact tone="info" title={text.aiNotice} />
          {stive.simulated ? (
            <AlertBanner compact tone="watch" title={text.simulatedNotice} />
          ) : null}
          {fait === "efface" ? (
            <p
              role="status"
              className="rounded-[var(--radius-card)] bg-brand-soft px-4 py-3 text-sm font-medium text-brand-ink"
            >
              {text.remove.done}
            </p>
          ) : null}
          {ambigu === "1" ? (
            <AlertBanner compact tone="watch" title={text.ambiguous} />
          ) : null}
          <StiveChat
            key={conversation?.id ?? "nouvelle"}
            conversationId={conversation?.id ?? null}
            firstName={profile.firstName}
            defaultFollowup={visibleFollowup ?? "auto"}
            followupOptions={followupOptions(t, followups)}
            messages={(conversation?.messages ?? []).map((message) => ({
              id: message.id,
              author: message.author,
              body: message.body,
              basedOn:
                message.author === "stive" && message.followupId
                  ? animalOf.has(message.followupId)
                    ? text.basedOn(animalOf.get(message.followupId) ?? "")
                    : text.basedOnOther
                  : null,
            }))}
          />
        </section>

        <aside aria-labelledby="stive-historique" className="min-w-0">
          <Card className="flex flex-col gap-3 p-4 xl:sticky xl:top-6">
            <div>
              <h2 id="stive-historique" className="font-bold">
                {text.history.title}
              </h2>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-muted">
                <ShieldCheck aria-hidden="true" className="size-3.5" />
                {text.history.private}
              </p>
            </div>
            {conversations.length > 0 ? (
              <ul className="-mx-2 flex max-h-[28rem] flex-col gap-0.5 overflow-y-auto">
                {conversations.map((item) => {
                  const current = item.id === conversation?.id;
                  return (
                    <li key={item.id}>
                      <Link
                        href={`/app/stive?c=${item.id}`}
                        aria-current={current ? "page" : undefined}
                        className={cn(
                          "block rounded-[var(--radius-control)] px-2 py-2 text-sm transition-colors hover:bg-brand-soft",
                          current &&
                            "bg-brand-soft font-semibold text-brand-ink",
                        )}
                      >
                        <span className="line-clamp-2 break-words">
                          {item.title}
                        </span>
                        <span className="mt-0.5 block text-xs font-normal text-ink-muted">
                          {formatRelativeMoment(item.updatedAt, now, locale)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-ink-muted">{text.history.empty}</p>
            )}
            {conversation ? (
              <DeleteConversationButton conversationId={conversation.id} />
            ) : null}
          </Card>
        </aside>
      </div>
    </>
  );
}
