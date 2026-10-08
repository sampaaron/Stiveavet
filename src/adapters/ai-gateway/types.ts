/**
 * Passerelle IA unique (architecture §10, ADR 0016). Le prestataire est interchangeable ;
 * seules les données nécessaires à une réponse lui sont envoyées, jamais l'historique brut,
 * un numéro ou un nom de propriétaire. Toute réponse repasse ensuite par les garde-fous
 * déterministes de Stivea Vet (`domains/conversations/guard.ts`) avant tout envoi.
 */
export type NumaReplyInput = {
  language: "fr" | "en";
  animalName: string;
  practiceName: string;
  /** Dernier message du propriétaire, seul contenu clinique transmis. */
  ownerMessage: string;
};

/** Nature de la réponse : sert au triage (lot 14), jamais de diagnostic. */
export type NumaIntent =
  "ack" | "concern" | "refer_treatment" | "refer_question";

export type NumaReply = { text: string; intent: NumaIntent };

/** Étape programmée de la fiche du suivi (lot 15), rédigée par Numa pour le propriétaire. */
export type NumaStepInput = {
  language: "fr" | "en";
  animalName: string;
  practiceName: string;
  kind: "message" | "question" | "photo_request" | "reminder" | "control";
  /** Consigne de l'étape, validée par le vétérinaire : Numa la suit sans rien y ajouter. */
  instruction: string;
  /** Rendez-vous de contrôle, pour l'étape « contrôle ». */
  controlAppointmentAt: Date | null;
};

export type AiGateway = {
  readonly simulated: boolean;
  numaReply(input: NumaReplyInput): Promise<NumaReply>;
  numaStep(input: NumaStepInput): Promise<{ text: string }>;
};
