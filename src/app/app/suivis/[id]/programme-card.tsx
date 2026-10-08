import { STEP_KIND_LABELS } from "@/domains/protocoles/content";
import type {
  ProgrammeStepState,
  ProgrammeView,
} from "@/domains/suivis/rappels";
import { SectionCard } from "@/ui/card";
import { cn } from "@/ui/cn";
import { formatDate, formatDateTime } from "@/ui/format";

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

/**
 * Programme d'un suivi lancé (ADR 0018) : étapes de la fiche, heure d'envoi prévue ou faite
 * (plage du cabinet, heure de Paris), et fin du suivi automatisé.
 */
export function ProgrammeCard({ programme }: { programme: ProgrammeView }) {
  return (
    <SectionCard
      title="Programme du suivi"
      description="Messages programmés de Numa, envoyés dans la plage d'envoi du cabinet."
    >
      {programme.steps.length ? (
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
      )}
      <p className="mt-4 border-t border-line pt-3 text-sm">
        {endLine(programme)}
      </p>
    </SectionCard>
  );
}
