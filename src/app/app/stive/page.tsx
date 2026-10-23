import { LockKeyhole, PawPrint, ShieldCheck, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import type { FollowupView } from "@/domains/suivis/service";
import { appText } from "@/i18n/app/server";
import type { AppDictionary } from "@/i18n/app/types";
import { memberProfile } from "@/server/auth/profile";
import { memberContext } from "@/server/authz";
import { services } from "@/server/services";
import { AiBadge, AssistantAvatar } from "@/ui/assistant-card";
import { ButtonLink } from "@/ui/button";
import { Card, SectionCard } from "@/ui/card";
import { formatRelativeMoment } from "@/ui/format";
import { PageHeader } from "@/ui/page-header";

import { StiveAnswerView } from "./answer";
import { AskStive, ClearConversation } from "./stive-forms";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await appText();
  return { title: t.stive.title };
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Suggestions en un clic, sur le dossier d'où vient la demande s'il y en a un. */
function suggestionsFor(
  t: AppDictionary,
  followup: FollowupView | null,
): string[] {
  const words = t.stive.suggestions;
  if (!followup) return [words.briefing, words.slots, words.appointments];
  const animal = followup.animalName;
  const change =
    followup.status === "paused"
      ? words.resume(animal)
      : followup.status === "active" || followup.status === "human_takeover"
        ? words.pause(animal)
        : null;
  return [
    words.summary(animal),
    words.draftNews(animal),
    words.draftPhoto(animal),
    ...(change ? [change] : []),
  ];
}

/**
 * Stive (cahier des charges §10, ADR 0034) : une conversation par personne, ses suggestions,
 * et ce qu'il sait faire. Sans Stive dans la formule, l'administrateur voit la présentation de
 * l'offre, sans aucune donnée ; les autres n'ont pas cet écran.
 */
export default async function StivePage({
  searchParams,
}: PageProps<"/app/stive">) {
  const context = await memberContext();
  const { t, locale } = await appText();
  const text = t.stive;
  const header = (
    <PageHeader
      eyebrow={text.eyebrow}
      title={text.title}
      description={text.description}
    />
  );

  if (!context.permissions.has("stive.use")) {
    if (!context.permissions.has("billing.manage")) notFound();
    return (
      <>
        {header}
        <Card className="flex flex-col items-start gap-4 p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <AssistantAvatar assistant="stive" size={56} />
            <div>
              <h2 className="flex flex-wrap items-center gap-2 text-lg font-bold">
                {text.upsell.title}
                <AiBadge assistant="stive" />
              </h2>
              <p className="text-sm text-ink-muted">{text.upsell.included}</p>
            </div>
          </div>
          <p className="max-w-2xl">{text.upsell.description}</p>
          <ul className="grid list-disc gap-1 pl-5 text-sm">
            {text.capabilities.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <ButtonLink
            href="/app/facturation"
            icon={<Sparkles aria-hidden="true" className="size-4" />}
          >
            {text.upsell.action}
          </ButtonLink>
        </Card>
      </>
    );
  }

  const { suivi, fait } = await searchParams;
  const now = new Date();
  // Dossier d'où vient la demande : seulement s'il est lisible en clinique par la personne.
  const [conversation, origin, profile] = await Promise.all([
    services.stive().conversation(context, now),
    typeof suivi === "string" && uuid.test(suivi)
      ? services.followups().find(context, suivi)
      : null,
    memberProfile(context),
  ]);
  const followup = origin?.access === "clinical" ? origin : null;
  const lastStive = conversation.entries.findLast(
    (entry) => entry.author === "stive",
  );
  const answerProps = {
    t,
    locale,
    now,
    proposals: conversation.proposals,
    canManageBilling: context.permissions.has("billing.manage"),
  };

  return (
    <>
      {header}
      {fait === "efface" ? (
        <p
          role="status"
          className="mb-4 rounded-[var(--radius-card)] bg-brand-soft px-4 py-3 text-sm font-medium text-brand-ink"
        >
          {text.privacy.cleared}
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="flex min-w-0 flex-col">
          <div className="flex items-center gap-3 border-b border-line px-5 py-4">
            <AssistantAvatar assistant="stive" size={44} />
            <div className="min-w-0">
              <h2 className="flex flex-wrap items-center gap-2 font-bold">
                {text.title}
                <AiBadge assistant="stive" />
              </h2>
              <p className="text-sm text-ink-muted">
                {t.ui.assistants.stiveRole}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2 border-b border-line bg-canvas px-5 py-3 text-sm text-ink-muted">
            <ShieldCheck
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-brand"
            />
            <p>{text.aiNotice}</p>
          </div>

          {followup ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
              <p className="flex min-w-0 items-center gap-2 text-sm">
                <PawPrint aria-hidden="true" className="size-4 text-brand" />
                <span>
                  <span className="font-semibold">
                    {text.dossierContext.title(followup.animalName)}
                  </span>{" "}
                  <span className="text-ink-muted">
                    · {text.dossierContext.description}
                  </span>
                </span>
              </p>
              <ButtonLink
                href={`/app/suivis/${followup.id}`}
                size="sm"
                variant="quiet"
              >
                {text.dossierContext.open}
              </ButtonLink>
            </div>
          ) : null}

          <div className="px-4 py-5 sm:px-5">
            {conversation.entries.length ? (
              <ol aria-label={text.thread} className="flex flex-col gap-4">
                {conversation.entries.map((entry) =>
                  entry.author === "member" ? (
                    <li key={entry.id} className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-br-md border border-accent/25 bg-accent/5 px-4 py-2.5 sm:max-w-[75%]">
                        <p className="mb-1 text-xs font-semibold text-ink-muted">
                          {text.you} ·{" "}
                          {formatRelativeMoment(entry.at, now, locale)}
                        </p>
                        <p className="whitespace-pre-line">{entry.question}</p>
                      </div>
                    </li>
                  ) : (
                    <li
                      key={entry.id}
                      id={
                        entry.id === lastStive?.id
                          ? "derniere-reponse"
                          : undefined
                      }
                      className="flex scroll-mt-6 items-start gap-2"
                    >
                      <AssistantAvatar assistant="stive" size={28} />
                      <div className="max-w-[92%] min-w-0 rounded-2xl rounded-tl-md border border-line bg-surface px-4 py-3 text-[15px] sm:max-w-[85%]">
                        <p className="mb-1.5 flex flex-wrap items-center gap-2 text-xs font-semibold text-ink-muted">
                          {text.title}
                          <AiBadge assistant="stive" />·{" "}
                          {formatRelativeMoment(entry.at, now, locale)}
                        </p>
                        <StiveAnswerView
                          answer={entry.answer}
                          {...answerProps}
                        />
                      </div>
                    </li>
                  ),
                )}
              </ol>
            ) : (
              <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
                <AssistantAvatar
                  assistant="stive"
                  size={64}
                  className="ring-4 ring-accent/10"
                />
                <p className="font-display text-xl font-semibold">
                  {text.greeting(profile.firstName)}
                </p>
                <p className="max-w-md text-sm text-ink-muted">
                  {text.greetingHelp}
                </p>
              </div>
            )}
          </div>

          <AskStive
            followupId={followup?.id ?? null}
            suggestions={suggestionsFor(t, followup)}
          />
        </Card>

        <div className="flex min-w-0 flex-col gap-6">
          <SectionCard title={text.capabilities.title}>
            <ul className="grid list-disc gap-1.5 pl-5 text-sm">
              {text.capabilities.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </SectionCard>
          <SectionCard title={text.privacy.title}>
            <div className="grid gap-3 text-sm">
              <p className="flex gap-2">
                <LockKeyhole
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-brand"
                />
                <span>{text.privacy.text}</span>
              </p>
              <p className="text-ink-muted">
                {text.privacy.usage(
                  conversation.usage.used,
                  conversation.usage.limit,
                )}
              </p>
              {conversation.entries.length ? (
                <div>
                  <ClearConversation />
                </div>
              ) : null}
            </div>
          </SectionCard>
        </div>
      </div>
    </>
  );
}
