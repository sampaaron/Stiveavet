/** Textes de cette partie de l'espace cabinet (voir ADR 0022). */
export const team = {
  title: "Équipe et droits",
  description: (vets: number, limit: number) =>
    `${vets} vétérinaire(s) sur ${limit} avec votre formule, invitations en attente comprises. Les assistants ne sont pas limités.`,
  invite: {
    title: "Inviter un membre",
    description:
      "La personne reçoit un lien par e-mail, valable 7 jours et utilisable une seule fois.",
    name: "Nom",
    email: "Adresse e-mail",
    role: "Rôle",
    submit: "Envoyer l'invitation",
  },
  pending: {
    title: "Invitations en attente",
    until: (date: string) => `jusqu'au ${date}`,
    cancel: "Annuler",
    cancelLabel: (email: string) => `Annuler l'invitation de ${email}`,
  },
  members: {
    title: "Membres",
    you: "vous",
    activeFollowups: (count: number) => `${count} suivi(s) en cours`,
    accessRemoved: "Accès retiré",
    adminHasAll:
      "Un vétérinaire administrateur a tous les droits. Changez son rôle pour les restreindre.",
  },
  permissions: {
    legend: (name: string) => `Droits de ${name}`,
    optional: "sur décision",
    submit: "Enregistrer les droits",
  },
  role: {
    label: (name: string) => `Rôle de ${name}`,
    submit: "Changer le rôle",
  },
  deactivate: {
    reassignLabel: (count: number) =>
      count > 1
        ? `Ses ${count} suivis en cours passent à`
        : "Son suivi en cours passe à",
    chooseVet: "Choisir un vétérinaire…",
    submit: "Retirer l'accès",
    submitLabel: (name: string) => `Retirer l'accès de ${name}`,
  },
  reactivate: {
    submit: "Rétablir l'accès",
    submitLabel: (name: string) => `Rétablir l'accès de ${name}`,
  },
  notices: {
    invited: "Invitation envoyée. Le lien est valable 7 jours.",
    invitationRevoked: "Invitation annulée.",
    permissionsSaved: "Droits enregistrés.",
    roleChanged:
      "Rôle modifié. Les droits ont repris les valeurs par défaut du rôle.",
    deactivated: "Accès retiré. Ses sessions sont fermées.",
    reactivated: "Accès rétabli.",
  },
  /** Messages des contrôles du formulaire d'invitation, par code. */
  validation: {
    email_too_long: "Adresse trop longue.",
    email_invalid: "Adresse e-mail invalide.",
    name_missing: "Indiquez le nom de la personne.",
    name_too_long: "Nom trop long.",
    fallback: "Vérifiez le nom, l'adresse e-mail et le rôle.",
  },
};
