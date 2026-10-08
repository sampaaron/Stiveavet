import type { Metadata } from "next";

import type { loginEventKind } from "@/domains/auth/schema";

import { requirePermission } from "@/server/authz";
import { services } from "@/server/services";
import { SectionCard } from "@/ui/card";
import { formatDateTime } from "@/ui/format";
import { PageHeader } from "@/ui/page-header";
import { EmptyState } from "@/ui/states";

export const metadata: Metadata = { title: "Journal d'activité" };

type Entry = { actorName: string; targetName: string | null };

/** Phrases du journal. Aucun contenu clinique n'est stocké dans le journal. */
const ACTION_SENTENCES: Record<string, (entry: Entry) => string> = {
  "organization.created": ({ actorName }) => `${actorName} a créé le cabinet`,
  "membership.created": ({ actorName, targetName }) =>
    !targetName || targetName === actorName
      ? `${actorName} a rejoint le cabinet`
      : `${targetName} a rejoint le cabinet sur invitation de ${actorName}`,
  "membership.deactivated": ({ actorName, targetName }) =>
    `${actorName} a retiré l'accès de ${targetName ?? "un membre"}`,
  "membership.reactivated": ({ actorName, targetName }) =>
    `${actorName} a rétabli l'accès de ${targetName ?? "un membre"}`,
  "membership.permissions_changed": ({ actorName, targetName }) =>
    `${actorName} a modifié les droits de ${targetName ?? "un membre"}`,
  "membership.role_changed": ({ actorName, targetName }) =>
    `${actorName} a changé le rôle de ${targetName ?? "un membre"}`,
  "invitation.created": ({ actorName }) =>
    `${actorName} a envoyé une invitation`,
  "invitation.revoked": ({ actorName }) =>
    `${actorName} a annulé une invitation`,
  "followup.viewed": ({ actorName }) => `${actorName} a consulté un dossier`,
  "followup.shared": ({ actorName }) => `${actorName} a partagé un dossier`,
  "followup.unshared": ({ actorName }) =>
    `${actorName} a retiré un partage de dossier`,
  "followup.privacy_changed": ({ actorName }) =>
    `${actorName} a changé la confidentialité d'un dossier`,
  "followup.reassigned": ({ actorName }) =>
    `${actorName} a réattribué un dossier`,
  "followup.prepared": ({ actorName }) =>
    `${actorName} a préparé un suivi depuis dr.veto`,
  "followup.protocol_chosen": ({ actorName }) =>
    `${actorName} a choisi le protocole d'un suivi`,
  "followup.plan_updated": ({ actorName }) =>
    `${actorName} a modifié la fiche d'un suivi`,
  "followup.treatments_validated": ({ actorName }) =>
    `${actorName} a validé des traitements importés`,
  "followup.launched": ({ actorName }) => `${actorName} a lancé un suivi`,
  "followup.paused": ({ actorName }) => `${actorName} a mis un suivi en pause`,
  "followup.resumed": ({ actorName }) => `${actorName} a repris un suivi`,
  "followup.stopped": ({ actorName }) => `${actorName} a arrêté un suivi`,
  "followup.reactivated": ({ actorName }) => `${actorName} a réactivé un suivi`,
  "followup.human_takeover": ({ actorName }) =>
    `${actorName} a repris la main sur une conversation (Numa en pause)`,
  "followup.numa_resumed": ({ actorName }) =>
    `${actorName} a rendu la conversation à Numa`,
  "conversation.message_sent": ({ actorName }) =>
    `${actorName} a écrit à un propriétaire`,
  "numa.reply_blocked": () =>
    "Garde-fou : une réponse de Numa a été remplacée par un renvoi au vétérinaire",
  "simulator.owner_message": ({ actorName }) =>
    `${actorName} a simulé un message de propriétaire (local)`,
  "simulator.owner_media": ({ actorName }) =>
    `${actorName} a simulé une photo ou un message vocal de propriétaire (local)`,
  "attachment.opened": ({ actorName }) =>
    `${actorName} a ouvert une photo ou un message vocal d'un suivi`,
  "attachment.purged": () =>
    "Un fichier arrivé à sa date limite de conservation a été supprimé",
  "photo.observation_blocked": () =>
    "Garde-fou : une observation de l'analyse photo a été écartée (elle ressemblait à un avis médical)",
  "agenda.capture_read": ({ actorName }) =>
    `${actorName} a envoyé une capture d'agenda : créneaux libres lus, capture supprimée`,
  "agenda.slot_removed": ({ actorName }) =>
    `${actorName} a retiré un créneau libre de l'agenda`,
  "synthesis.generated": ({ actorName }) =>
    `Synthèse pré-consultation préparée par l'IA (simulation) à l'ouverture d'un dossier par ${actorName}`,
  "followup.purged": () =>
    "Un suivi arrivé à un an de conservation a été effacé ; seules des statistiques anonymes restent",
  "followup.ended_automatically": () =>
    "Fin du suivi automatisé à la date de contrôle (la conversation reste ouverte)",
  "conversation.group_created": () =>
    "Les deux propriétaires ont accepté : groupe WhatsApp créé avec Numa (simulé)",
  "conversation.left_group": () =>
    "Un propriétaire a quitté le groupe WhatsApp du suivi",
  "conversation.owner_stopped_all": () =>
    "Un propriétaire a demandé l'arrêt du suivi : plus aucun message automatique",
  "appointment.requested": () =>
    "Un propriétaire a demandé un rendez-vous à Numa",
  "appointment.proposed": () =>
    "Un propriétaire a choisi un créneau proposé par Numa (à confirmer)",
  "appointment.confirmed": ({ actorName }) =>
    `${actorName} a confirmé un rendez-vous choisi avec Numa`,
  "appointment.declined": ({ actorName }) =>
    `${actorName} a refusé un créneau choisi avec Numa`,
  "appointment.callback_done": ({ actorName }) =>
    `${actorName} a rappelé un propriétaire qui demandait un rendez-vous`,
  "settings.appointment_windows_changed": ({ actorName }) =>
    `${actorName} a modifié les plages de rendez-vous de Numa`,
  "settings.appointment_durations_changed": ({ actorName }) =>
    `${actorName} a modifié la durée des rendez-vous`,
  "alert.raised": () =>
    "Triage : un message de propriétaire a ouvert une alerte",
  "alert.escalated": () =>
    "Urgence sans accusé de réception : toute l'équipe vétérinaire a été alertée",
  "alert.acknowledged": ({ actorName }) =>
    `${actorName} a accusé réception d'une alerte`,
  "alert.resolved": ({ actorName }) => `${actorName} a clos une alerte`,
  "job.retried": ({ actorName }) => `${actorName} a relancé une tâche en échec`,
  "job.cancelled": ({ actorName }) =>
    `${actorName} a abandonné une tâche en échec`,
};

function sentence(event: Entry & { action: string }): string {
  return (
    ACTION_SENTENCES[event.action]?.(event) ??
    `${event.actorName} · ${event.action}`
  );
}

const LOGIN_LABELS: Record<(typeof loginEventKind.enumValues)[number], string> =
  {
    login_succeeded: "Connexion réussie",
    login_failed: "Connexion refusée",
    login_rate_limited: "Connexion bloquée (trop de tentatives)",
    code_sent: "Code de sécurité envoyé",
    code_failed: "Code de sécurité refusé",
    session_locked: "Session verrouillée",
    session_unlocked: "Session déverrouillée",
    unlock_failed: "Déverrouillage refusé",
    logout: "Déconnexion",
    password_reset_requested: "Réinitialisation du mot de passe demandée",
    password_reset_completed: "Mot de passe réinitialisé",
    signup_completed: "Compte créé",
  };

export default async function ActivityPage() {
  const context = await requirePermission("activity_log.read");
  const { actions, logins } = await services.team().activity(context);

  return (
    <>
      <PageHeader
        title="Journal d'activité"
        description="Qui a fait quoi et quand. Le journal ne peut être ni modifié ni effacé."
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="Actions">
          {actions.length === 0 ? (
            <EmptyState title="Aucune action enregistrée" />
          ) : (
            <ol className="grid gap-3">
              {actions.map((event) => (
                <li key={event.id} className="flex gap-3 text-sm">
                  <time
                    dateTime={event.occurredAt.toISOString()}
                    className="w-28 shrink-0 text-ink-muted tabular-nums"
                  >
                    {formatDateTime(event.occurredAt)}
                  </time>
                  <span>{sentence(event)}</span>
                </li>
              ))}
            </ol>
          )}
        </SectionCard>
        <SectionCard title="Connexions">
          {logins.length === 0 ? (
            <EmptyState title="Aucune connexion enregistrée" />
          ) : (
            <ol className="grid gap-3">
              {logins.map((event) => (
                <li key={event.id} className="flex gap-3 text-sm">
                  <time
                    dateTime={event.occurredAt.toISOString()}
                    className="w-28 shrink-0 text-ink-muted tabular-nums"
                  >
                    {formatDateTime(event.occurredAt)}
                  </time>
                  <span>
                    <span className="font-semibold">{event.userName}</span> ·{" "}
                    {LOGIN_LABELS[event.kind]}
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
