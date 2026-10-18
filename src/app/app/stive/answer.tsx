import {
  BellRing,
  CalendarClock,
  CircleCheck,
  CircleSlash,
  ClipboardPen,
  MessageSquareText,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import type { StiveProposalView } from "@/domains/stive/service";
import type { StiveAnswer } from "@/domains/stive/reponses";
import type { AppDictionary } from "@/i18n/app/types";
import type { Locale } from "@/i18n/locales";
import { ButtonLink } from "@/ui/button";
import {
  formatDayTitle,
  formatRelativeDayTime,
  formatTime,
  shortPersonName,
} from "@/ui/format";

import { ProposalDecision } from "./stive-forms";

type Props = {
  t: AppDictionary;
  locale: Locale;
  now: Date;
  proposals: Record<string, StiveProposalView>;
  canManageBilling: boolean;
};

const linkClasses =
  "font-semibold text-brand-ink underline-offset-2 hover:underline";

function Heading({ children }: { children: ReactNode }) {
  return <h3 className="font-bold text-ink">{children}</h3>;
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
        {title}
      </p>
      {children}
    </div>
  );
}

function Bullets({ items }: { items: readonly string[] }) {
  return (
    <ul className="grid list-disc gap-1 pl-5">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

/** État d'une carte déjà traitée, ou rien si elle attend encore. */
function Outcome({
  t,
  proposal,
}: {
  t: AppDictionary;
  proposal: StiveProposalView | undefined;
}) {
  if (!proposal || proposal.status === "open") return null;
  if (proposal.status === "expired")
    return (
      <p className="flex items-center gap-1.5 text-sm text-ink-muted">
        <CircleSlash aria-hidden="true" className="size-4" />
        {t.stive.card.expired}
      </p>
    );
  return (
    <p className="flex items-center gap-1.5 text-sm font-semibold text-brand-ink">
      <CircleCheck aria-hidden="true" className="size-4" />
      {proposal.outcome ? t.stive.card.outcomes[proposal.outcome] : null}
    </p>
  );
}

function ToConfirm({ t }: { t: AppDictionary }) {
  return (
    <span className="rounded-full bg-watch-soft px-2 py-0.5 text-xs font-semibold text-watch">
      {t.stive.card.toConfirm}
    </span>
  );
}

const dossier = (id: string) => `/app/suivis/${id}`;

/** Réponse de Stive mise en mots dans la langue de la personne. */
export function StiveAnswerView({
  answer,
  ...props
}: Props & { answer: StiveAnswer | null }) {
  const { t, locale, now, proposals } = props;
  const text = t.stive;
  if (!answer) return <p className="text-ink-muted">{text.hidden}</p>;

  switch (answer.kind) {
    case "briefing": {
      const words = text.briefing;
      const line = (item: (typeof answer.urgent)[number]) => (
        <li key={item.id}>
          <Link href={dossier(item.id)} className={linkClasses}>
            {item.animalName}
          </Link>{" "}
          <span className="text-ink-muted">
            ·{" "}
            {words.line(
              item.procedure,
              item.dayNumber,
              shortPersonName(item.responsibleName),
            )}
          </span>
        </li>
      );
      const calm =
        answer.urgent.length === 0 &&
        answer.watch.length === 0 &&
        !answer.unacknowledged;
      return (
        <div className="grid gap-3">
          <Heading>{words.title}</Heading>
          <p>
            {calm ? `${words.calm} ` : null}
            {words.active(answer.active)}
          </p>
          {answer.urgent.length ? (
            <Group title={words.urgent}>
              <ul className="grid gap-1">{answer.urgent.map(line)}</ul>
            </Group>
          ) : null}
          {answer.watch.length ? (
            <Group title={words.watch}>
              <ul className="grid gap-1">{answer.watch.map(line)}</ul>
            </Group>
          ) : null}
          {answer.unacknowledged ? (
            <p className="flex items-center gap-2">
              <BellRing aria-hidden="true" className="size-4 text-urgent" />
              <span>{words.unacknowledged(answer.unacknowledged)}</span>
              <Link href="/app/alertes" className={linkClasses}>
                {words.openAlerts}
              </Link>
            </p>
          ) : null}
          {answer.agenda ? (
            <Group title={words.agenda}>
              {answer.agenda.length ? (
                <ul className="grid gap-1">
                  {answer.agenda.map((item) => (
                    <li key={`${item.startsAt}-${item.vetName}`}>
                      <span className="font-semibold tabular-nums">
                        {formatTime(new Date(item.startsAt), locale)}
                      </span>{" "}
                      ·{" "}
                      {"appointment" in item.title
                        ? t.dashboard.agenda.appointment(
                            item.title.appointment === "other"
                              ? t.dashboard.agenda.otherAppointment
                              : t.labels.appointmentKinds[
                                  item.title.appointment
                                ],
                            item.title.animalName,
                          )
                        : item.title.text}{" "}
                      <span className="text-ink-muted">
                        · {shortPersonName(item.vetName)}
                        {item.pending ? ` · ${words.pending}` : null}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-ink-muted">{words.agendaEmpty}</p>
              )}
            </Group>
          ) : null}
          {answer.pendingAppointments ? (
            <p className="flex items-center gap-2">
              <CalendarClock aria-hidden="true" className="size-4 text-watch" />
              <span>
                {words.pendingAppointments(answer.pendingAppointments)}
              </span>
              <Link href="/app/agenda" className={linkClasses}>
                {words.openAgenda}
              </Link>
            </p>
          ) : null}
          {answer.drafts.length ? (
            <Group title={words.drafts}>
              <ul className="grid gap-1">
                {answer.drafts.map((item) => (
                  <li key={item.id}>
                    <Link href={dossier(item.id)} className={linkClasses}>
                      {item.animalName}
                    </Link>{" "}
                    <span className="text-ink-muted">
                      · {words.draftLine(shortPersonName(item.responsibleName))}
                    </span>
                  </li>
                ))}
              </ul>
            </Group>
          ) : null}
        </div>
      );
    }

    case "summary": {
      const words = text.summary;
      const { followup, synthesis } = answer;
      return (
        <div className="grid gap-3">
          <div>
            <Heading>{words.title(followup.animalName)}</Heading>
            <p className="text-sm text-ink-muted">
              {words.line(
                followup.procedure,
                followup.dayNumber,
                t.labels.followupStatus[followup.status],
              )}
            </p>
          </div>
          {synthesis ? (
            <>
              <p>{synthesis.evolution}</p>
              {synthesis.positives.length ? (
                <Group title={words.positives}>
                  <Bullets items={synthesis.positives} />
                </Group>
              ) : null}
              {synthesis.negatives.length ? (
                <Group title={words.negatives}>
                  <Bullets items={synthesis.negatives} />
                </Group>
              ) : null}
              {synthesis.openQuestions.length ? (
                <Group title={words.questions}>
                  <Bullets items={synthesis.openQuestions} />
                </Group>
              ) : null}
              <p className="text-sm text-ink-muted">
                {words.exchanges(
                  answer.exchanges.ownerMessages,
                  answer.exchanges.photos,
                  answer.exchanges.voiceNotes,
                )}
                {answer.openAlerts
                  ? ` · ${words.openAlerts(answer.openAlerts)}`
                  : null}
              </p>
              {synthesis.withheld ? (
                <p className="text-sm text-watch">
                  {words.withheld(synthesis.withheld)}
                </p>
              ) : null}
            </>
          ) : (
            <p>{words.notLaunched}</p>
          )}
          <div>
            <ButtonLink
              href={dossier(followup.id)}
              size="sm"
              variant="secondary"
            >
              {text.openFile}
            </ButtonLink>
          </div>
        </div>
      );
    }

    case "slots": {
      const words = text.slots;
      const from = new Date(`${answer.period.from}T12:00:00Z`);
      const until = new Date(`${answer.period.until}T12:00:00Z`);
      const range =
        answer.period.from === answer.period.until
          ? formatDayTitle(from, locale)
          : `${formatDayTitle(from, locale)} – ${formatDayTitle(until, locale)}`;
      const days = new Map<string, typeof answer.slots>();
      for (const slot of answer.slots) {
        const key = formatDayTitle(new Date(slot.startsAt), locale);
        days.set(key, [...(days.get(key) ?? []), slot]);
      }
      return (
        <div className="grid gap-3">
          <div>
            <Heading>
              {words.title} ·{" "}
              {words.heading(words.periods[answer.period.label], range)}
            </Heading>
            <p className="text-sm text-ink-muted">
              {answer.vetName ? words.ofVet(answer.vetName) : words.ofTeam}
            </p>
          </div>
          {answer.slots.length ? (
            [...days].map(([day, slots]) => (
              <Group key={day} title={day}>
                <ul className="grid gap-1">
                  {slots.map((slot) => (
                    <li key={`${slot.startsAt}-${slot.vetName}`}>
                      <span className="font-semibold tabular-nums">
                        {formatTime(new Date(slot.startsAt), locale)} –{" "}
                        {formatTime(new Date(slot.endsAt), locale)}
                      </span>{" "}
                      <span className="text-ink-muted">
                        · {shortPersonName(slot.vetName)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Group>
            ))
          ) : (
            <p>{words.empty}</p>
          )}
          <p className="text-sm text-ink-muted">
            {words.source}{" "}
            <Link href="/app/agenda" className={linkClasses}>
              {words.openAgenda}
            </Link>
          </p>
        </div>
      );
    }

    case "appointments": {
      const words = text.appointments;
      return (
        <div className="grid gap-3">
          <Heading>{words.title}</Heading>
          {answer.items.length ? (
            <ul className="grid gap-2">
              {answer.items.map((item) => {
                const when = formatRelativeDayTime(
                  new Date(item.startsAt),
                  now,
                  locale,
                );
                const proposal = item.proposalId
                  ? proposals[item.proposalId]
                  : undefined;
                const kind =
                  item.appointmentKind === "other"
                    ? t.dashboard.agenda.otherAppointment
                    : t.labels.appointmentKinds[item.appointmentKind];
                return (
                  <li
                    key={
                      item.proposalId ?? `${item.followupId}-${item.startsAt}`
                    }
                    className="grid gap-2 rounded-[var(--radius-control)] border border-line bg-canvas/60 p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">
                        {t.dashboard.agenda.appointment(kind, item.animalName)}
                      </p>
                      {proposal?.status === "open" ? <ToConfirm t={t} /> : null}
                    </div>
                    <p className="text-sm text-ink-muted">
                      {words.line(when, shortPersonName(item.vetName))}
                    </p>
                    {proposal?.status === "open" && item.proposalId ? (
                      <ProposalDecision
                        proposalId={item.proposalId}
                        confirm={{
                          text: words.confirm,
                          label: words.confirmLabel(item.animalName, when),
                        }}
                        decline={{
                          text: words.decline,
                          label: words.declineLabel(item.animalName, when),
                        }}
                      />
                    ) : (
                      <Outcome t={t} proposal={proposal} />
                    )}
                    {!item.proposalId ? (
                      <p className="text-sm text-ink-muted">{words.readOnly}</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p>{words.empty}</p>
          )}
          {answer.items.length ? (
            <p className="text-sm text-ink-muted">{words.help}</p>
          ) : null}
          {answer.callbacks ? (
            <p className="text-sm">
              {words.callbacks(answer.callbacks)}{" "}
              <Link href="/app/agenda" className={linkClasses}>
                {text.briefing.openAgenda}
              </Link>
            </p>
          ) : null}
        </div>
      );
    }

    case "draft": {
      const proposal = proposals[answer.proposalId];
      return (
        <div className="grid gap-3">
          <Heading>
            {text.draft.title(
              t.common.list(answer.recipients),
              answer.followup.animalName,
            )}
          </Heading>
          {proposal?.draft ? (
            <blockquote className="flex gap-2 rounded-[var(--radius-control)] border border-line bg-canvas/60 p-3">
              <MessageSquareText
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-brand"
              />
              <p className="whitespace-pre-line">{proposal.draft}</p>
            </blockquote>
          ) : null}
          <p className="text-sm text-ink-muted">{text.draft.help}</p>
          <div>
            <ButtonLink
              href={`${dossier(answer.followup.id)}?brouillon=${answer.proposalId}#conversation`}
              size="sm"
              icon={<ClipboardPen aria-hidden="true" className="size-4" />}
            >
              {text.draft.use}
            </ButtonLink>
          </div>
        </div>
      );
    }

    case "status": {
      const words = text.status;
      const proposal = proposals[answer.proposalId];
      const animal = answer.followup.animalName;
      return (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Heading>{words.question[answer.change](animal)}</Heading>
            {proposal?.status === "open" ? <ToConfirm t={t} /> : null}
          </div>
          <p>{words.effect[answer.change]}</p>
          {proposal?.status === "open" ? (
            <ProposalDecision
              proposalId={answer.proposalId}
              confirm={{
                text: words.confirm,
                label: words.confirmLabel[answer.change](animal),
              }}
            />
          ) : (
            <Outcome t={t} proposal={proposal} />
          )}
          <p className="text-sm">
            <Link href={dossier(answer.followup.id)} className={linkClasses}>
              {text.openFile}
            </Link>
          </p>
        </div>
      );
    }

    case "choose":
      return (
        <div className="grid gap-2">
          <Heading>{text.choose.title}</Heading>
          {answer.candidates.length ? (
            <ul className="grid gap-1">
              {answer.candidates.map((candidate) => (
                <li key={candidate.id}>
                  <Link
                    href={`/app/stive?suivi=${candidate.id}`}
                    className={linkClasses}
                  >
                    {text.choose.candidate(
                      candidate.animalName,
                      candidate.ownerName,
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p>{text.choose.empty}</p>
          )}
        </div>
      );

    case "unavailable": {
      const words = text.unavailable;
      const animal = answer.animalName ?? words.thisFollowup;
      const message =
        answer.reason === "not_clinical"
          ? words.not_clinical
          : answer.reason === "no_agenda"
            ? words.no_agenda
            : answer.reason === "same_status"
              ? words.same_status[answer.change ?? "pause"](animal)
              : words[answer.reason](animal);
      return <p>{message}</p>;
    }

    case "limit":
      return (
        <div className="grid gap-2">
          <p>
            {text.limit.reached(
              answer.limit,
              formatDayTitle(new Date(`${answer.resetsOn}T12:00:00Z`), locale),
            )}
          </p>
          {answer.upgrade ? <p>{text.limit.upgrade}</p> : null}
          {answer.upgrade && props.canManageBilling ? (
            <div>
              <ButtonLink href="/app/facturation" size="sm" variant="secondary">
                {text.limit.billing}
              </ButtonLink>
            </div>
          ) : null}
        </div>
      );

    default:
      return (
        <div className="grid gap-2">
          <Heading>{text.unknown.title}</Heading>
          <p>{text.unknown.help}</p>
          <Bullets items={text.capabilities.items} />
        </div>
      );
  }
}
