import type { ProtocolContent } from "./content";

/**
 * Bibliothèque de départ. Contenu FICTIF de démonstration, rédigé pour illustrer l'outil :
 * il n'a été relu par aucun vétérinaire. Chaque protocole installé reste marqué « à valider
 * par un vétérinaire » tant qu'un vétérinaire du cabinet ne l'a pas relu et validé.
 * Numa n'en tire jamais de décision médicale : elle pose les questions prévues et escalade.
 */
export type LibraryProtocol = ProtocolContent & { key: string };

export const PROTOCOL_LIBRARY: readonly LibraryProtocol[] = [
  {
    key: "sterilisation-chatte",
    name: "Stérilisation de la chatte",
    category: "surgery",
    species: "cat",
    description:
      "Suivi après ovariectomie : réveil, appétit, cicatrice et contrôle.",
    durationDays: 10,
    steps: [
      {
        offsetHours: 4,
        kind: "message",
        content:
          "Prendre des nouvelles du retour à la maison et rappeler les consignes de sortie du cabinet.",
      },
      {
        offsetHours: 24,
        kind: "question",
        content: "A-t-elle mangé et bu depuis le retour ? Se déplace-t-elle ?",
      },
      {
        offsetHours: 48,
        kind: "photo_request",
        content: "Demander une photo de la cicatrice, à la lumière du jour.",
      },
      {
        offsetHours: 120,
        kind: "question",
        content: "La collerette ou le body est-il toujours en place ?",
      },
      {
        offsetHours: 216,
        kind: "control",
        content: "Rappeler le rendez-vous de contrôle prévu par le cabinet.",
      },
    ],
    alerts: [
      {
        level: "urgent",
        description: "Saignement de la plaie qui ne s'arrête pas",
      },
      {
        level: "urgent",
        description: "Abattement marqué ou difficulté à respirer",
      },
      { level: "watch", description: "Refus de manger au-delà de 24 heures" },
      { level: "watch", description: "Plaie rouge, gonflée ou qui suinte" },
    ],
  },
  {
    key: "sterilisation-chienne",
    name: "Stérilisation de la chienne",
    category: "surgery",
    species: "dog",
    description:
      "Suivi après ovariectomie : réveil, appétit, cicatrice, activité et contrôle.",
    durationDays: 12,
    steps: [
      {
        offsetHours: 4,
        kind: "message",
        content:
          "Prendre des nouvelles du retour à la maison et rappeler les consignes de sortie du cabinet.",
      },
      {
        offsetHours: 24,
        kind: "question",
        content: "A-t-elle mangé, bu et uriné depuis l'intervention ?",
      },
      {
        offsetHours: 48,
        kind: "photo_request",
        content: "Demander une photo de la cicatrice, à la lumière du jour.",
      },
      {
        offsetHours: 120,
        kind: "reminder",
        content: "Rappeler de limiter les efforts et les sauts.",
      },
      {
        offsetHours: 240,
        kind: "control",
        content: "Rappeler le rendez-vous de contrôle prévu par le cabinet.",
      },
    ],
    alerts: [
      {
        level: "urgent",
        description: "Saignement de la plaie qui ne s'arrête pas",
      },
      {
        level: "urgent",
        description: "Ventre gonflé ou douloureux, abattement marqué",
      },
      { level: "watch", description: "Plaie rouge, gonflée ou qui suinte" },
      { level: "watch", description: "Refus de manger au-delà de 24 heures" },
    ],
  },
  {
    key: "castration-chien",
    name: "Castration du chien",
    category: "surgery",
    species: "dog",
    description: "Suivi après castration : comportement, léchage, cicatrice.",
    durationDays: 10,
    steps: [
      {
        offsetHours: 4,
        kind: "message",
        content: "Prendre des nouvelles du retour à la maison.",
      },
      {
        offsetHours: 24,
        kind: "question",
        content: "A-t-il mangé, bu et uriné depuis l'intervention ?",
      },
      {
        offsetHours: 72,
        kind: "photo_request",
        content: "Demander une photo de la cicatrice.",
      },
      {
        offsetHours: 168,
        kind: "reminder",
        content: "Rappeler de limiter les sorties et d'éviter le léchage.",
      },
      {
        offsetHours: 216,
        kind: "control",
        content: "Rappeler le rendez-vous de contrôle prévu par le cabinet.",
      },
    ],
    alerts: [
      { level: "urgent", description: "Gonflement important ou saignement" },
      { level: "watch", description: "Léchage insistant de la plaie" },
      {
        level: "watch",
        description: "Absence d'urine depuis plus de 12 heures",
      },
    ],
  },
  {
    key: "detartrage",
    name: "Détartrage et soins dentaires",
    category: "dental",
    species: "both",
    description: "Suivi après détartrage, avec ou sans extraction.",
    durationDays: 7,
    steps: [
      {
        offsetHours: 6,
        kind: "message",
        content: "Prendre des nouvelles après l'anesthésie.",
      },
      {
        offsetHours: 24,
        kind: "question",
        content: "L'animal mange-t-il sa nourriture habituelle ou humidifiée ?",
      },
      {
        offsetHours: 96,
        kind: "question",
        content:
          "Remarquez-vous une mauvaise odeur ou un saignement de la bouche ?",
      },
    ],
    alerts: [
      { level: "urgent", description: "Saignement buccal qui persiste" },
      { level: "watch", description: "Refus de manger au-delà de 48 heures" },
    ],
  },
  {
    key: "suivi-traitement",
    name: "Suivi de traitement à domicile",
    category: "treatment",
    species: "both",
    description:
      "Rappels d'administration du traitement validé par le vétérinaire et nouvelles régulières.",
    durationDays: 14,
    steps: [
      {
        offsetHours: 24,
        kind: "question",
        content: "Le traitement a-t-il pu être donné sans difficulté ?",
      },
      {
        offsetHours: 72,
        kind: "question",
        content: "Comment évoluent l'état général et l'appétit ?",
      },
      {
        offsetHours: 168,
        kind: "reminder",
        content:
          "Rappeler la fin prévue du traitement, sans jamais en modifier la posologie.",
      },
      {
        offsetHours: 312,
        kind: "control",
        content: "Proposer un contrôle si le cabinet l'a prévu.",
      },
    ],
    alerts: [
      {
        level: "urgent",
        description:
          "Réaction après une prise (vomissements répétés, gonflement)",
      },
      { level: "watch", description: "Traitement impossible à administrer" },
    ],
  },
];

export function libraryProtocol(key: string): LibraryProtocol | undefined {
  return PROTOCOL_LIBRARY.find((protocol) => protocol.key === key);
}
