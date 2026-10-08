/** Textes de cette partie de l'espace cabinet (voir ADR 0022). */
export const journal = {
  title: "Journal d'activité",
  description:
    "Qui a fait quoi et quand. Le journal ne peut être ni modifié ni effacé.",
  actionsTitle: "Actions",
  noActions: "Aucune action enregistrée",
  loginsTitle: "Connexions",
  noLogins: "Aucune connexion enregistrée",
  /** Auteur d'une action qui n'est plus membre, ou action du système. */
  removedMember: "Membre retiré",
  system: "Système",
  /** Connexion d'une adresse qui ne correspond à aucun compte. */
  unknownUser: "Inconnu",
  /** Membre visé par une action quand son nom n'est plus connu. */
  someMember: "un membre",
  /** Phrases du journal. Aucun contenu clinique n'est stocké dans le journal. */
  joined: (actor: string) => `${actor} a rejoint le cabinet`,
  joinedOnInvitation: (member: string, actor: string) =>
    `${member} a rejoint le cabinet sur invitation de ${actor}`,
  onMember: {
    "membership.deactivated": (actor: string, member: string) =>
      `${actor} a retiré l'accès de ${member}`,
    "membership.reactivated": (actor: string, member: string) =>
      `${actor} a rétabli l'accès de ${member}`,
    "membership.permissions_changed": (actor: string, member: string) =>
      `${actor} a modifié les droits de ${member}`,
    "membership.role_changed": (actor: string, member: string) =>
      `${actor} a changé le rôle de ${member}`,
  },
  byMember: {
    "organization.created": (actor: string) => `${actor} a créé le cabinet`,
    "invitation.created": (actor: string) => `${actor} a envoyé une invitation`,
    "invitation.revoked": (actor: string) => `${actor} a annulé une invitation`,
    "followup.viewed": (actor: string) => `${actor} a consulté un dossier`,
    "followup.shared": (actor: string) => `${actor} a partagé un dossier`,
    "followup.unshared": (actor: string) =>
      `${actor} a retiré un partage de dossier`,
    "followup.privacy_changed": (actor: string) =>
      `${actor} a changé la confidentialité d'un dossier`,
    "followup.reassigned": (actor: string) =>
      `${actor} a réattribué un dossier`,
    "followup.prepared": (actor: string) =>
      `${actor} a préparé un suivi depuis dr.veto`,
    "followup.protocol_chosen": (actor: string) =>
      `${actor} a choisi le protocole d'un suivi`,
    "followup.plan_updated": (actor: string) =>
      `${actor} a modifié la fiche d'un suivi`,
    "followup.treatments_validated": (actor: string) =>
      `${actor} a validé des traitements importés`,
    "followup.launched": (actor: string) => `${actor} a lancé un suivi`,
    "followup.paused": (actor: string) => `${actor} a mis un suivi en pause`,
    "followup.resumed": (actor: string) => `${actor} a repris un suivi`,
    "followup.stopped": (actor: string) => `${actor} a arrêté un suivi`,
    "followup.reactivated": (actor: string) => `${actor} a réactivé un suivi`,
    "followup.human_takeover": (actor: string) =>
      `${actor} a repris la main sur une conversation (Numa en pause)`,
    "followup.numa_resumed": (actor: string) =>
      `${actor} a rendu la conversation à Numa`,
    "conversation.message_sent": (actor: string) =>
      `${actor} a écrit à un propriétaire`,
    "simulator.owner_message": (actor: string) =>
      `${actor} a simulé un message de propriétaire (local)`,
    "simulator.owner_media": (actor: string) =>
      `${actor} a simulé une photo ou un message vocal de propriétaire (local)`,
    "attachment.opened": (actor: string) =>
      `${actor} a ouvert une photo ou un message vocal d'un suivi`,
    "agenda.capture_read": (actor: string) =>
      `${actor} a envoyé une capture d'agenda : créneaux libres lus, capture supprimée`,
    "agenda.slot_removed": (actor: string) =>
      `${actor} a retiré un créneau libre de l'agenda`,
    "synthesis.generated": (actor: string) =>
      `Synthèse pré-consultation préparée par l'IA (simulation) à l'ouverture d'un dossier par ${actor}`,
    "appointment.confirmed": (actor: string) =>
      `${actor} a confirmé un rendez-vous choisi avec Numa`,
    "appointment.declined": (actor: string) =>
      `${actor} a refusé un créneau choisi avec Numa`,
    "appointment.callback_done": (actor: string) =>
      `${actor} a rappelé un propriétaire qui demandait un rendez-vous`,
    "settings.appointment_windows_changed": (actor: string) =>
      `${actor} a modifié les plages de rendez-vous de Numa`,
    "settings.appointment_durations_changed": (actor: string) =>
      `${actor} a modifié la durée des rendez-vous`,
    "alert.acknowledged": (actor: string) =>
      `${actor} a accusé réception d'une alerte`,
    "alert.resolved": (actor: string) => `${actor} a clos une alerte`,
    "job.retried": (actor: string) => `${actor} a relancé une tâche en échec`,
    "job.cancelled": (actor: string) =>
      `${actor} a abandonné une tâche en échec`,
  },
  automatic: {
    "numa.reply_blocked":
      "Garde-fou : une réponse de Numa a été remplacée par un renvoi au vétérinaire",
    "attachment.purged":
      "Un fichier arrivé à sa date limite de conservation a été supprimé",
    "photo.observation_blocked":
      "Garde-fou : une observation de l'analyse photo a été écartée (elle ressemblait à un avis médical)",
    "followup.purged":
      "Un suivi arrivé à un an de conservation a été effacé ; seules des statistiques anonymes restent",
    "followup.ended_automatically":
      "Fin du suivi automatisé à la date de contrôle (la conversation reste ouverte)",
    "conversation.group_created":
      "Les deux propriétaires ont accepté : groupe WhatsApp créé avec Numa (simulé)",
    "conversation.left_group":
      "Un propriétaire a quitté le groupe WhatsApp du suivi",
    "conversation.owner_stopped_all":
      "Un propriétaire a demandé l'arrêt du suivi : plus aucun message automatique",
    "appointment.requested": "Un propriétaire a demandé un rendez-vous à Numa",
    "appointment.proposed":
      "Un propriétaire a choisi un créneau proposé par Numa (à confirmer)",
    "alert.raised": "Triage : un message de propriétaire a ouvert une alerte",
    "alert.escalated":
      "Urgence sans accusé de réception : toute l'équipe vétérinaire a été alertée",
  },
  /** Langue de Numa pour un propriétaire ; `language` : nom de la langue (« Anglais »). */
  ownerLanguageDetected: (owner: "primary" | "secondary", language: string) =>
    `Langue de Numa reconnue dans les messages du ${owner === "secondary" ? "second propriétaire" : "propriétaire"} : ${language.toLowerCase()}`,
  ownerLanguageChanged: (
    owner: "primary" | "secondary",
    language: string,
    actor: string,
  ) =>
    `Langue de Numa corrigée pour le ${owner === "secondary" ? "second propriétaire" : "propriétaire"} par ${actor} : ${language.toLowerCase()}`,
  logins: {
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
  },
};
