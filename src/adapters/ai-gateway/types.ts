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

/** Message vocal du propriétaire (lot 16) : le fichier seul, sans nom ni numéro. */
export type VoiceTranscriptionInput = {
  audio: Uint8Array;
  contentType: string;
  languageHint: "fr" | "en";
};

export type VoiceTranscription = { text: string; language: "fr" | "en" };

/**
 * Analyse photo assistée (lot 16), si le cabinet l'a activée : des observations visibles
 * sur l'image et des signaux à regarder, jamais un diagnostic ni un conseil de traitement.
 * Chaque observation repasse par les garde-fous de Stivea Vet avant d'être gardée.
 */
export type PhotoObservationInput = {
  image: Uint8Array;
  contentType: string;
  language: "fr" | "en";
  animalName: string;
};

/** Capture d'écran d'un agenda (lot 16) : seuls les créneaux libres en sont tirés. */
export type AgendaCaptureInput = {
  image: Uint8Array;
  contentType: string;
  now: Date;
};

export type FreeSlot = { startsAt: Date; endsAt: Date };

export type AiGateway = {
  readonly simulated: boolean;
  numaReply(input: NumaReplyInput): Promise<NumaReply>;
  numaStep(input: NumaStepInput): Promise<{ text: string }>;
  transcribeVoice(input: VoiceTranscriptionInput): Promise<VoiceTranscription>;
  observePhoto(
    input: PhotoObservationInput,
  ): Promise<{ observations: string[] }>;
  readAgendaCapture(input: AgendaCaptureInput): Promise<{ slots: FreeSlot[] }>;
};
