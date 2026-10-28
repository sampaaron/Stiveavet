/** Textes de cette partie de l'espace cabinet (voir ADR 0022). */
export const account = {
  title: "Mon compte",
  description:
    "Vos informations, votre activité et la sécurité de votre compte. Vous seul voyez cette page.",
  profile: {
    title: "Vos informations",
    email: "E-mail de connexion",
    organization: "Cabinet",
    role: "Rôle",
    alertPhone: "Numéro des alertes urgentes",
    noAlertPhone: "Aucun numéro renseigné",
    language: "Langue de l'espace",
    languages: { fr: "Français", en: "English" },
    memberSince: "Membre depuis le",
    plan: "Formule du cabinet",
    changeHint:
      "Pour changer votre nom, votre e-mail ou votre rôle, adressez-vous à l'administrateur du cabinet.",
  },
  activity: {
    title: "Votre activité",
    description: "Les suivis dont vous êtes responsable, hors suivis test.",
    statuses: {
      active: "En cours",
      paused: "En pause",
      human_takeover: "Repris par l'équipe",
      draft: "Brouillons",
      ended: "Terminés",
    },
    stive: "Demandes à Stive ce mois-ci",
    stiveUsage: (used: number, limit: number) => `${used} sur ${limit}`,
    stiveOff: "Stive n'est pas inclus dans votre accès.",
  },
  rights: {
    title: "Vos droits",
    description:
      "Ce que votre compte permet dans le cabinet, selon votre rôle et la formule.",
  },
  privacy: {
    title: "Ce qui reste privé",
    points: [
      "Vos échanges avec Stive ne sont visibles que par vous et sont effacés après 30 jours.",
      "Le journal d'activité garde vos actions sur les dossiers, jamais le contenu médical.",
      "Votre mot de passe n'est jamais stocké en clair, et personne au cabinet ne peut le lire.",
    ],
  },
  password: {
    title: "Mot de passe",
    description:
      "Changer de mot de passe ferme toutes vos autres sessions ; vous recevez un e-mail de confirmation.",
    current: "Mot de passe actuel",
    submit: "Changer le mot de passe",
    changed:
      "Mot de passe modifié. Vos autres sessions sont fermées et un e-mail de confirmation vous a été envoyé.",
  },
  sessions: {
    title: "Sessions ouvertes",
    description:
      "Les navigateurs où vous êtes connecté. Une session se ferme seule après 12 heures.",
    thisDevice: "Cet appareil",
    unknownDevice: "Appareil non identifié",
    opened: (date: string) => `Ouverte le ${date}`,
    lastActive: (date: string) => `dernière activité le ${date}`,
    revokeOthers: "Déconnecter les autres appareils",
    noOthers: "Aucune autre session ouverte.",
    revoked: (count: number) =>
      count > 1
        ? `${count} autres sessions ont été fermées.`
        : count === 1
          ? "L'autre session a été fermée."
          : "Aucune autre session n'était ouverte.",
  },
  devices: {
    title: "Appareils de confiance",
    description:
      "Sur ces appareils, aucun code de sécurité n'est demandé à la connexion pendant 90 jours. Retirez ceux que vous n'utilisez plus.",
    none: "Aucun appareil de confiance. Le code de sécurité est demandé aux vétérinaires à chaque nouvel appareil.",
    added: (date: string) => `Reconnu le ${date}`,
    until: (date: string) => `jusqu'au ${date}`,
    revoke: "Retirer",
    revokeLabel: (device: string) =>
      `Retirer l'appareil de confiance ${device}`,
    revoked:
      "Appareil retiré : le code de sécurité y sera demandé à la prochaine connexion.",
    notFound: "Cet appareil n'est plus dans la liste. Rechargez la page.",
  },
  passkeys: {
    title: "Clés d'accès",
    description:
      "Après 40 minutes sans activité, Stivea Vet se verrouille. Avec une clé d'accès, vous le déverrouillez d'un geste (empreinte, visage ou code de l'appareil) sans retaper votre mot de passe.",
    loginNote:
      "Une clé d'accès ne sert qu'à déverrouiller. Pour vous connecter, le mot de passe et, pour un vétérinaire, le code de sécurité restent demandés.",
    none: "Aucune clé d'accès : le mot de passe est demandé pour déverrouiller.",
    addedOn: (date: string) => `Ajoutée le ${date}`,
    lastUsed: (date: string) => `utilisée le ${date}`,
    neverUsed: "jamais utilisée",
    label: "Nom de la clé",
    labelHint:
      "Pour la reconnaître, par exemple « Ordinateur de la consultation ».",
    password: "Votre mot de passe",
    submit: "Ajouter une clé d'accès",
    added: "Clé d'accès ajoutée. Un e-mail de confirmation vous a été envoyé.",
    cancelled: "Ajout annulé sur l'appareil : rien n'a été enregistré.",
    already: "Cet appareil a déjà une clé d'accès pour votre compte.",
    invalid: "L'appareil n'a pas pu créer la clé. Réessayez.",
    limit: (max: number) =>
      `Vous avez déjà ${max} clés d'accès. Retirez-en une avant d'en ajouter une autre.`,
    unsupported:
      "Ce navigateur ne gère pas les clés d'accès. Le mot de passe reste demandé pour déverrouiller.",
    remove: "Retirer",
    removeLabel: (label: string) => `Retirer la clé d'accès ${label}`,
    removed: "Clé d'accès retirée : elle ne déverrouille plus Stivea Vet.",
    notFound: "Cette clé n'est plus dans la liste. Rechargez la page.",
  },
};
