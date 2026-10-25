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

/**
 * Élément d'un dossier transmis pour la synthèse pré-consultation (lot 17) : le texte d'un
 * message ou la transcription d'un vocal, jamais un nom, un numéro ni un fichier.
 */
export type SynthesisEvent = {
  at: Date;
  from: "owner" | "numa" | "vet";
  text: string;
  media: "photo" | "voice" | null;
  /** Niveau donné par le triage déterministe (messages du propriétaire seulement). */
  triage: "normal" | "watch" | "urgent" | null;
};

export type SynthesisInput = {
  /** Langue du vétérinaire qui lit la synthèse. */
  language: "fr" | "en";
  procedure: string;
  /** Jours écoulés depuis l'intervention (J+n), heure de Paris. */
  dayNumber: number;
  events: SynthesisEvent[];
};

/**
 * Partie rédigée de la synthèse. Les paroles du propriétaire n'y figurent qu'entre
 * guillemets et mot pour mot ; tout le reste repasse par les garde-fous (ni diagnostic, ni
 * dosage, ni réassurance), comme une réponse de Numa.
 */
export type SynthesisDraft = {
  evolution: string;
  positives: string[];
  negatives: string[];
  openQuestions: string[];
};

/**
 * Dossier évoqué dans une conversation avec Stive (ADR 0035), réduit au strict utile : le
 * prénom de l'animal, jamais le nom ni le numéro d'un propriétaire, ni un nom de l'équipe.
 * Les éléments cliniques ne sont présents que si la personne a l'accès clinique au dossier.
 */
export type StiveCase = {
  animal: string;
  species: "dog" | "cat";
  status: "draft" | "active" | "paused" | "human_takeover" | "ended";
  clinical: StiveClinicalCase | null;
};

export type StiveClinicalCase = {
  procedure: string;
  /** Jours écoulés depuis l'intervention (J+n), heure de Paris. */
  dayNumber: number;
  triage: "normal" | "watch" | "urgent";
  breed: string | null;
  ageYears: number | null;
  weightKg: number | null;
  /** Traitements du dossier ; `validated` : validé par un vétérinaire. */
  treatments: { name: string; instructions: string; validated: boolean }[];
  allergies: string[];
  antecedents: string[];
  openAlerts: { level: "watch" | "urgent"; status: string }[];
  /** Derniers échanges utiles avec le propriétaire, coordonnées masquées. */
  recentExchanges: {
    dayNumber: number;
    from: "owner" | "numa" | "vet";
    text: string;
    media: "photo" | "voice" | "document" | null;
  }[];
};

/** Tour d'une conversation avec Stive : le vétérinaire, ou la réponse de Stive. */
export type StiveTurn = { from: "vet" | "stive"; text: string };

export type StiveChatInput = {
  /** Langue d'interface du vétérinaire (Stive suit celle de son dernier message). */
  language: "fr" | "en";
  /** Tours précédents, puis le dernier message du vétérinaire en dernier. */
  turns: StiveTurn[];
  case: StiveCase | null;
};

export type AiGateway = {
  readonly simulated: boolean;
  /** Conversation libre du vétérinaire avec Stive, l'assistant interne (ADR 0035). */
  stiveChat(input: StiveChatInput): Promise<{ text: string }>;
  numaReply(input: NumaReplyInput): Promise<NumaReply>;
  numaStep(input: NumaStepInput): Promise<{ text: string }>;
  transcribeVoice(input: VoiceTranscriptionInput): Promise<VoiceTranscription>;
  observePhoto(
    input: PhotoObservationInput,
  ): Promise<{ observations: string[] }>;
  readAgendaCapture(input: AgendaCaptureInput): Promise<{ slots: FreeSlot[] }>;
  summarizeFollowup(input: SynthesisInput): Promise<SynthesisDraft>;
};
