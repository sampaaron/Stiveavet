/** Textes de cette partie de l'espace cabinet (voir ADR 0022 et 0035). */
export const stive = {
  title: "Stive",
  eyebrow: "Votre assistant IA",
  description:
    "Discutez avec Stive de médecine, de l'organisation du cabinet, de la communication avec les propriétaires et des animaux que vous suivez.",
  aiNotice:
    "Stive est une IA : ses réponses peuvent être inexactes. Elles ne remplacent ni votre examen ni votre jugement clinique, et la décision vous revient toujours.",
  simulatedNotice:
    "Mode simulé (poste local) : Stive répond par des règles écrites d'avance, sans vrai modèle d'IA.",
  talk: "Parler à Stive",
  newConversation: "Nouvelle conversation",
  history: {
    title: "Vos conversations",
    private: "Visibles de vous seul.",
    empty: "Aucune conversation pour l'instant.",
  },
  welcome: {
    title: (firstName: string) =>
      `Bonjour ${firstName}, de quoi voulez-vous parler ?`,
    description:
      "Citez un animal suivi par son prénom, ou choisissez son dossier : Stive s'appuie alors sur ce que vous pouvez y lire.",
    suggestionsLabel: "Pour commencer",
    suggestions: [
      "Fais-moi le point sur les suivis qui demandent mon attention.",
      "Aide-moi à rédiger un message rassurant mais prudent pour un propriétaire inquiet après une stérilisation.",
      "Quels signes doivent faire revoir un chien en urgence après une chirurgie orthopédique ?",
      "Comment mieux organiser les contrôles post-opératoires de la semaine ?",
    ],
  },
  composer: {
    label: "Votre message à Stive",
    placeholder: "Posez une question, citez un animal suivi…",
    hint: "Entrée pour envoyer, Maj + Entrée pour aller à la ligne.",
    send: "Envoyer",
  },
  followup: {
    label: "Dossier du cabinet",
    auto: "Détection automatique (prénom de l'animal)",
    none: "Aucun dossier",
    option: (animal: string, detail: string) => `${animal} · ${detail}`,
    help: "Stive ne lit que les dossiers auxquels vous avez accès, et ne transmet au service d'IA ni nom, ni numéro, ni e-mail de propriétaire.",
  },
  you: "Vous",
  thinking: "Stive rédige sa réponse…",
  basedOn: (animal: string) => `S'appuie sur le dossier de ${animal}`,
  basedOnOther: "S'appuie sur un dossier du cabinet",
  ambiguous:
    "Plusieurs animaux suivis correspondent à votre message : choisissez le bon dossier dans la liste pour que Stive s'appuie dessus.",
  errors: {
    empty: "Écrivez votre message à Stive.",
    tooLong: "Message trop long : 2 000 caractères au plus.",
    rateLimited:
      "Vous avez envoyé beaucoup de messages en peu de temps : réessayez dans quelques minutes.",
    unavailable:
      "Stive ne peut pas répondre pour le moment. Votre message n'a pas été envoyé : réessayez dans un instant.",
  },
  remove: {
    button: "Effacer cette conversation",
    confirm:
      "Effacer définitivement cette conversation ? Cette action est irréversible.",
    done: "Conversation effacée.",
  },
};
