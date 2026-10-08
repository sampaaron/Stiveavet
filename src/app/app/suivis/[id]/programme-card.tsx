import { STEP_KIND_LABELS } from "@/domains/protocoles/content";
import type {
  ProgrammeStepState,
  ProgrammeView,
} from "@/domains/suivis/rappels";
import { SectionCard } from "@/ui/card";
import { cn } from "@/ui/cn";
import { formatDate, formatDateTime, formatRelativeDayTime } from "@/ui/format";

const STATE_LABELS: Record<ProgrammeStepState, (at: Date | null) => string> = {
  sent: (at) => (at ? `Envoyé le ${formatDateTime(at)}` : "Envoyé"),
  sending: () => "Envoi en cours",
  failed: () => "Envoi en échec (voir les tâches en échec)",
  scheduled: (at) => (at ? `Prévu le ${formatDateTime(at)}` : "Prévu"),
  waiting_consent: () => "Après l'accord du propriétaire",
  on_hold: () => "En attente : Numa n'a pas la main",
  not_sent: () => "Non envoyé",
  after_end: () => "Après la fin du suivi : ne partira pas",
};

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

function endLine(programme: ProgrammeView): string {
  if (programme.ended)
    return programme.ended.automatic
      ? `Suivi automatisé terminé${programme.ended.at ? ` le ${formatDate(programme.ended.at)}` : ""}, à la date de contrôle. La conversation reste ouverte : Numa répond si le propriétaire écrit, et vous êtes prévenu.`
      : `Suivi arrêté${programme.ended.at ? ` le ${formatDate(programme.ended.at)}` : ""} : plus aucun rappel ne part.`;
  if (programme.plannedEndAt)
    return `Fin du suivi automatisé le ${formatDateTime(programme.plannedEndAt)}${programme.endsAtControl ? ", date du contrôle" : ", un jour après la dernière étape"}. La conversation restera ouverte.`;
  return "Aucune fin automatique prévue : arrêtez le suivi vous-même, ou fixez un rendez-vous de contrôle.";
}

function ProgrammeSteps({ programme }: { programme: ProgrammeView }) {
  return programme.steps.length ? (
    <ol className="grid gap-3" aria-label="Étapes du suivi">
      {programme.steps.map((step) => (
        <li key={step.id} className="grid gap-0.5 text-sm">
          <p className="font-semibold">{STEP_KIND_LABELS[step.kind]}</p>
          <p className="text-ink-muted">{step.content}</p>
          <p className={cn("font-medium", STATE_TONES[step.state])}>
            {STATE_LABELS[step.state](step.at)}
          </p>
        </li>
      ))}
    </ol>
  ) : (
    <p className="text-sm text-ink-muted">Aucune étape programmée.</p>
  );
}

const UPCOMING: ReadonlySet<ProgrammeStepState> = new Set([
  "scheduled",
  "waiting_consent",
  "on_hold",
]);
const UPCOMING_NOTE: Partial<Record<ProgrammeStepState, string>> = {
  waiting_consent: "après l'accord du propriétaire",
  on_hold: "en attente : Numa n'a pas la main",
};
const MAX_UPCOMING = 4;

/**
 * « Prochaines étapes » du dossier (écran de référence) : les prochains envois de Numa et le
 * contrôle, puis le programme complet sur demande.
 */
export function NextStepsCard({
  programme,
  controlAppointmentAt,
  now,
}: {
  programme: ProgrammeView;
  controlAppointmentAt: Date | null;
  now: Date;
}) {
  const upcoming = programme.steps
    .filter(
      (step) =>
        UPCOMING.has(step.state) &&
        (step.at ?? step.dueAt).getTime() >= now.getTime(),
    )
    .slice(0, MAX_UPCOMING)
    .map((step) => {
      const note = UPCOMING_NOTE[step.state];
      return {
        key: step.id,
        at: formatRelativeDayTime(step.at ?? step.dueAt, now),
        label: `${STEP_KIND_LABELS[step.kind]}${note ? ` (${note})` : ""}`,
      };
    });
  if (controlAppointmentAt && controlAppointmentAt.getTime() >= now.getTime())
    upcoming.push({
      key: "controle",
      at: formatRelativeDayTime(controlAppointmentAt, now),
      label: "Contrôle post-opératoire",
    });
  return (
    <SectionCard
      title="Prochaines étapes"
      description={`Contrôle : ${
        controlAppointmentAt
          ? formatRelativeDayTime(controlAppointmentAt, now)
          : "non programmé"
      }`}
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
        <p className="text-sm text-ink-muted">Aucune étape programmée.</p>
      )}
      <p className="mt-3 text-xs text-ink-muted">{endLine(programme)}</p>
      {programme.steps.length > 0 ? (
        <details className="mt-3 border-t border-line pt-3">
          <summary className="cursor-pointer text-sm font-semibold text-brand-ink">
            Programme complet ({programme.steps.length}{" "}
            {programme.steps.length > 1 ? "étapes" : "étape"})
          </summary>
          <div className="mt-3">
            <ProgrammeSteps programme={programme} />
          </div>
        </details>
      ) : null}
    </SectionCard>
  );
}
