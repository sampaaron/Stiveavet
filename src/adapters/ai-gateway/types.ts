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

export type AiGateway = {
  readonly simulated: boolean;
  numaReply(input: NumaReplyInput): Promise<NumaReply>;
  numaStep(input: NumaStepInput): Promise<{ text: string }>;
  transcribeVoice(input: VoiceTranscriptionInput): Promise<VoiceTranscription>;
  observePhoto(
    input: PhotoObservationInput,
  ): Promise<{ observations: string[] }>;
  readAgendaCapture(input: AgendaCaptureInput): Promise<{ slots: FreeSlot[] }>;
  summarizeFollowup(input: SynthesisInput): Promise<SynthesisDraft>;
  /** Un tour de la conversation de Stive : une réponse, ou des outils à exécuter. */
  stiveChat(input: StiveChatInput): Promise<StiveChatStep>;
};

/**
 * Conversation avec Stive (ADR 0042) : un tour de modèle avec appel d'outils, au format
 * « chat completions » compatible OpenAI et Mistral. La boucle (exécution des outils avec les
 * droits de la personne, limites, garde-fous) reste côté Stivea Vet ; la passerelle ne fait
 * qu'un appel. Les résultats d'outils sont déjà réduits au strict nécessaire par l'appelant.
 */
export type StiveToolCall = {
  /** Identifiant donné par le modèle, renvoyé tel quel avec le résultat. */
  id: string;
  name: string;
  /** Arguments en JSON, à relire par Zod avant tout usage. */
  arguments: string;
};

export type StiveChatMessage =
  | { role: "user"; content: string }
  /** Réponse du modèle ; `toolCalls` : outils qu'il a demandés à ce tour. */
  | { role: "assistant"; content: string; toolCalls?: StiveToolCall[] }
  | { role: "tool"; callId: string; name: string; content: string };

export type StiveToolDefinition = {
  name: string;
  description: string;
  /** Schéma JSON des arguments (sous-ensemble accepté par les fournisseurs visés). */
  parameters: Record<string, unknown>;
};

export type StiveChatInput = {
  /** Langue de l'interface, à défaut de celle du dernier message. */
  language: "fr" | "en";
  /** Contexte du tour, sans aucune donnée de propriétaire. */
  context: {
    /** Jour de Paris, « AAAA-MM-JJ ». */
    today: string;
    role: "vet" | "assistant";
    /** Référence du dossier d'où vient la demande (« S3 »), s'il y en a un. */
    openFollowup: string | null;
  };
  messages: StiveChatMessage[];
  tools: StiveToolDefinition[];
  /** false : le modèle doit répondre en texte (dernier tour permis). */
  allowTools: boolean;
};

export type StiveChatStep =
  { kind: "answer"; text: string } | { kind: "tools"; calls: StiveToolCall[] };
