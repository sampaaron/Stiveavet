import type {
  ProgrammeStepState,
  ProgrammeView,
} from "@/domains/suivis/rappels";
import type { AppDictionary } from "@/i18n/app/types";
import type { Locale } from "@/i18n/locales";
import { SectionCard } from "@/ui/card";
import { cn } from "@/ui/cn";
import { formatDate, formatDateTime, formatRelativeDayTime } from "@/ui/format";

type Text = AppDictionary["dossier"]["programme"];

function stateLabel(
  text: Text,
  locale: Locale,
  state: ProgrammeStepState,
  at: Date | null,
): string {
  const states = text.states;
  const when = at ? formatDateTime(at, locale) : null;
  switch (state) {
    case "sent":
      return when ? states.sentAt(when) : states.sent;
    case "scheduled":
      return when ? states.scheduledAt(when) : states.scheduled;
    case "sending":
      return states.sending;
    case "failed":
      return states.failed;
    case "waiting_consent":
      return states.waitingConsent;
    case "on_hold":
      return states.onHold;
    case "not_sent":
      return states.notSent;
    case "after_end":
      return states.afterEnd;
  }
}

const STATE_TONES: Record<ProgrammeStepState, string> = {
  sent: "text-brand-ink",
  sending: "text-ink-muted",
  failed: "text-urgent",
  scheduled: "text-ink",
  waiting_consent: "text-ink-muted",
  on_hold: "text-watch",
  not_sent: "text-ink-muted",
  after_end: "text-ink-muted",
};

function endLine(
  text: Text,
  locale: Locale,
  programme: ProgrammeView,
): string {
  if (programme.ended) {
    const at = programme.ended.at
      ? formatDate(programme.ended.at, locale)
      : null;
    return programme.ended.automatic
      ? text.endedAutomatically(at)
      : text.stopped(at);
  }
  if (programme.plannedEndAt) {
    const at = formatDateTime(programme.plannedEndAt, locale);
    return programme.endsAtControl
      ? text.plannedEndAtControl(at)
      : text.plannedEndAfterLastStep(at);
  }
  return text.noEnd;
}

function ProgrammeSteps({
  t,
  locale,
  programme,
}: {
  t: AppDictionary;
  locale: Locale;
  programme: ProgrammeView;
}) {
  const text = t.dossier.programme;
  return programme.steps.length ? (
    <ol className="grid gap-3" aria-label={text.stepsLabel}>
      {programme.steps.map((step) => (
        <li key={step.id} className="grid gap-0.5 text-sm">
          <p className="font-semibold">{t.labels.stepKinds[step.kind]}</p>
          <p className="text-ink-muted">{step.content}</p>
          <p className={cn("font-medium", STATE_TONES[step.state])}>
            {stateLabel(text, locale, step.state, step.at)}
          </p>
        </li>
      ))}
    </ol>
  ) : (
    <p className="text-sm text-ink-muted">{text.noSteps}</p>
  );
}

const UPCOMING: ReadonlySet<ProgrammeStepState> = new Set([
  "scheduled",
  "waiting_consent",
  "on_hold",
]);
function upcomingNote(
  text: Text,
  state: ProgrammeStepState,
): string | undefined {
  if (state === "waiting_consent") return text.upcomingNotes.waitingConsent;
  if (state === "on_hold") return text.upcomingNotes.onHold;
  return undefined;
}
const MAX_UPCOMING = 4;

/**
 * « Prochaines étapes » du dossier (écran de référence) : les prochains envois de Numa et le
 * contrôle, puis le programme complet sur demande.
 */
export function NextStepsCard({
  t,
  locale,
  programme,
  controlAppointmentAt,
  now,
}: {
  t: AppDictionary;
  locale: Locale;
  programme: ProgrammeView;
  controlAppointmentAt: Date | null;
  now: Date;
}) {
  const text = t.dossier.programme;
  const upcoming = programme.steps
    .filter(
      (step) =>
        UPCOMING.has(step.state) &&
        (step.at ?? step.dueAt).getTime() >= now.getTime(),
    )
    .slice(0, MAX_UPCOMING)
    .map((step) => {
      const note = upcomingNote(text, step.state);
      const kind = t.labels.stepKinds[step.kind];
      return {
        key: step.id,
        at: formatRelativeDayTime(step.at ?? step.dueAt, now, locale),
        label: note ? `${kind} (${note})` : kind,
      };
    });
  if (controlAppointmentAt && controlAppointmentAt.getTime() >= now.getTime())
    upcoming.push({
      key: "controle",
      at: formatRelativeDayTime(controlAppointmentAt, now, locale),
      label: t.labels.appointmentKinds.post_op_control,
    });
  return (
    <SectionCard
      title={text.title}
      description={text.control(
        controlAppointmentAt
          ? formatRelativeDayTime(controlAppointmentAt, now, locale)
          : text.notScheduled,
      )}
    >
      {upcoming.length > 0 ? (
        <ol className="grid gap-2">
          {upcoming.map((step) => (
            <li key={step.key} className="flex gap-3 text-sm">
              <span className="w-32 shrink-0 font-semibold">{step.at}</span>
              <span className="min-w-0 text-ink-muted">{step.label}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-ink-muted">{text.noSteps}</p>
      )}
      <p className="mt-3 text-xs text-ink-muted">
        {endLine(text, locale, programme)}
      </p>
      {programme.steps.length > 0 ? (
        <details className="mt-3 border-t border-line pt-3">
          <summary className="cursor-pointer text-sm font-semibold text-brand-ink">
            {text.full(programme.steps.length)}
          </summary>
          <div className="mt-3">
            <ProgrammeSteps t={t} locale={locale} programme={programme} />
          </div>
        </details>
      ) : null}
    </SectionCard>
  );
}
