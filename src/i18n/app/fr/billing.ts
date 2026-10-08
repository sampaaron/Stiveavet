/** Textes de cette partie de l'espace cabinet (voir ADR 0022). */
export const billing = {
  title: "Facturation",
  description:
    "Prix hors taxes, facturés au cabinet et prélevés chaque mois. Prélèvements simulés pendant cette phase : aucun compte bancaire n'est débité.",
  /** Montant hors taxes ou toutes taxes comprises ; `amount` est déjà mis en forme. */
  exclVat: (amount: string) => `${amount} HT`,
  inclVat: (amount: string) => `${amount} TTC`,
  noSubscription: {
    title: "Aucun abonnement enregistré",
    description:
      "Ce cabinet a été créé avant la facturation. Contactez le support pour choisir votre formule.",
  },
  mandate: {
    title: "Mandat de prélèvement à signer",
    action: "Ouvrir le démarrage guidé",
    body: "Les factures restent à prélever tant que le mandat n'est pas signé.",
  },
  plan: "Formule",
  phase: {
    trial: (month: number, months: number, price: string) =>
      `Essai pilote, mois ${month} sur ${months}, puis ${price} HT par mois`,
    annualUntil: (date: string) => `Engagement annuel jusqu'au ${date}`,
    monthly: (month: number) =>
      `Sans engagement, mois ${month} de votre abonnement`,
  },
  next: {
    title: "Prochain prélèvement",
    none: "Aucun",
    on: (date: string) => `Le ${date}`,
    onWithSurcharges: (date: string, amount: string) =>
      `Le ${date}, plus ${amount} HT de suppléments`,
    cancelled: (date: string) => `Abonnement résilié, effectif le ${date}`,
  },
  activeFollowups: {
    title: "Suivis actifs",
    count: (used: number, included: number) => `${used} / ${included} inclus`,
  },
  usage: {
    title: "Usage de Numa",
    description: (included: number, launch: string, reactivation: string) =>
      `${included} suivis actifs en même temps sont inclus. Au-delà, chaque nouveau suivi coûte ${launch} HT et chaque réactivation ${reactivation} HT, prélevés avec l'abonnement suivant. Un suivi terminé libère sa place ; les suivis test ne comptent pas.`,
    pending: (launches: number, reactivations: number, amount: string) =>
      `En attente de facturation : ${launches} lancement(s) et ${reactivations} réactivation(s), soit ${amount} HT.`,
    nonePending: "Aucun supplément en attente.",
  },
  annual: {
    title: "Engagement annuel",
    reminder:
      "À choisir avant le 7e mois. Sans réponse, vous restez au mois, au tarif sans engagement : rien ne bascule automatiquement.",
    anytime: "Possible à tout moment, sur votre demande uniquement.",
    prices: (annual: string, monthly: string) =>
      `Avec engagement : ${annual} HT par mois pendant 12 mois. Sans engagement : ${monthly} HT par mois.`,
    stayMonthlyIntro: "Vous préférez garder la liberté de résilier chaque mois.",
    confirm: (price: string) =>
      `Je m'engage pour 12 mois à ${price} HT par mois, prélevés chaque mois.`,
    submit: "Passer à l'engagement annuel",
    stayMonthly: "Rester au mois",
  },
  changePlan: {
    title: "Changer de formule",
    description: (vetSeats: number, trialMonths: number | null) =>
      `La nouvelle formule s'applique à la prochaine échéance${trialMonths ? `, après les ${trialMonths} mois d'essai` : ""}. Votre équipe compte ${vetSeats} vétérinaire(s), invitations en attente comprises.`,
    option: (name: string, price: string) => `${name} · ${price} HT par mois`,
    optionDetail: (maxVets: number, stive: string) =>
      `${maxVets === 1 ? "1 vétérinaire" : `Jusqu'à ${maxVets} vétérinaires`}. ${stive}.`,
    legend: "Formule",
    submit: "Changer de formule",
  },
  invoices: {
    title: "Factures",
    description:
      "Montants hors taxes et TVA à 20 %. Factures simulées pendant cette phase.",
    period: (start: string, end: string) => `du ${start} au ${end}`,
    status: {
      paid: "Payée",
      open: "À prélever",
      failed: "Prélèvement refusé",
    },
    vat: "TVA 20 %",
    total: "Total TTC",
    none: "Aucune facture pour l'instant.",
  },
  cancel: {
    title: "Résilier",
    description:
      "Vos suivis en cours continuent jusqu'à leur fin, pour ne laisser aucun propriétaire sans réponse. Aucun nouveau suivi n'est possible après la date d'effet. Quand le dernier suivi se termine, le cabinet garde un accès en lecture seule pendant 3 mois.",
    confirm: (date: string) =>
      `Je confirme la résiliation, effective le ${date}.`,
    submit: "Résilier l'abonnement",
  },
  access: {
    graceTitle: (days: number) =>
      `Prélèvement refusé : ${days} jour(s) pour régulariser`,
    graceBody: (date: string) =>
      `Après le ${date}, les nouveaux suivis seront suspendus. Les suivis en cours continuent dans tous les cas.`,
    blockedTitle: "Nouveaux suivis suspendus",
    blockedUnpaid:
      "Le paiement n'a pas été régularisé dans les 30 jours. Vos suivis en cours continuent jusqu'à leur fin.",
    blockedCancelled:
      "L'abonnement est résilié. Vos suivis en cours continuent jusqu'à leur fin.",
    readOnlyTitle: (date: string) => `Accès en lecture seule jusqu'au ${date}`,
    readOnlyBody:
      "Plus aucun suivi n'est en cours. Vous pouvez consulter l'historique ; un export PDF est disponible sur demande au support.",
    closedTitle: "Accès au cabinet terminé",
    closedBody:
      "La période de lecture seule est terminée. Contactez le support pour toute demande d'export.",
  },
  settle: "Relancer le prélèvement (simulé)",
  notices: {
    confirmRequired: "Cochez la case de confirmation pour continuer.",
    planChanged: "Formule modifiée. Elle s'applique à la prochaine échéance.",
    annualCommitted:
      "Engagement annuel enregistré. Le tarif annuel s'applique à la prochaine échéance.",
    stayMonthly: "C'est noté : vous restez au mois, sans engagement.",
    cancelled: (date: string) =>
      `Résiliation enregistrée. Elle prend effet le ${date} ; vos suivis en cours continuent jusqu'à leur fin.`,
    settled: "Prélèvement réussi (simulé). Merci, tout est en ordre.",
    settleFailed:
      "Le prélèvement a de nouveau échoué. Vérifiez le mandat ou contactez le support.",
  },
};
