/** Textes de cette partie de l'espace cabinet (voir ADR 0022). */
export const account = {
  title: "Sécurité du compte",
  description:
    "Votre mot de passe, vos sessions ouvertes et vos appareils de confiance. Ces réglages ne concernent que vous.",
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
};
