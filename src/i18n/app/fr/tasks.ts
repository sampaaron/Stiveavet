/** Textes de cette partie de l'espace cabinet (voir ADR 0022). */
export const tasks = {
  title: "Tâches en échec",
  description:
    "Envois, rappels et alertes que Stivea Vet n'a pas pu mener à bien après plusieurs tentatives espacées. Relancez-les une fois la cause réglée, ou abandonnez-les.",
  done: {
    retried: "Tâche relancée : le worker la reprend dans un instant.",
    cancelled: "Tâche abandonnée : elle ne sera plus tentée.",
  },
  count: (count: number) => `${count} tâche${count > 1 ? "s" : ""} en échec`,
  allGood: "Tout fonctionne",
  empty: {
    title: "Aucune tâche en échec",
    description:
      "Les envois et rappels en difficulté apparaîtront ici après leur dernière tentative.",
  },
  attempts: (count: number, failedAt: string) =>
    `${count} tentative${count > 1 ? "s" : ""} · dernier échec le ${failedAt}`,
  openFile: "Ouvrir le dossier",
  retry: "Relancer",
  retryLabel: (task: string) => `Relancer : ${task}`,
  cancel: "Abandonner",
  cancelLabel: (task: string) => `Abandonner : ${task}`,
  /** Tâches connues ; les lots suivants en ajoutent (rappels, escalades…). */
  kinds: {
    "followup.reminder": "Rappel au propriétaire",
    "followup.message": "Message de Numa",
    "followup.end": "Fin du suivi automatisé",
    "alert.escalate": "Escalade d'une alerte urgente",
    "alert.notify": "Alerte au vétérinaire",
    "media.transcribe": "Transcription d'un message vocal",
    "media.observe": "Analyse d'une photo",
    "attachment.purge": "Suppression d'un fichier",
    "retention.sweep": "Recherche des données arrivées à échéance",
    "followup.purge": "Effacement d'un suivi arrivé à échéance",
    "billing.annual_offer": "E-mail d'offre d'engagement annuel",
    "whatsapp.send": "Message WhatsApp",
    "whatsapp.media": "Photo ou vocal reçu par WhatsApp",
    "alert.deliver": "Alerte WhatsApp à un vétérinaire",
    "notify.whatsapp_failed": "E-mail d'échec d'un envoi WhatsApp",
  },
  unknownKind: "Tâche technique",
  /** Motifs techniques d'échec, par code (jamais le message brut d'une exception). */
  errors: {
    provider_unavailable: "Service d'envoi indisponible",
    provider_rejected: "Envoi refusé par le service",
    provider_account: "Compte WhatsApp du cabinet à reconnecter",
    recipient_unreachable: "Numéro injoignable sur WhatsApp",
    invalid_payload: "Données de la tâche invalides",
    target_missing: "Dossier ou destinataire introuvable",
    lease_expired: "Interrompue par un arrêt du worker",
    unexpected_error: "Erreur inattendue",
  },
};
