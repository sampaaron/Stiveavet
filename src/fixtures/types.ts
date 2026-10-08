/**
 * Types des données fictives affichées par les écrans de référence (lot 2).
 * Les vrais modèles de données arrivent avec le schéma PostgreSQL (lot 3).
 */
export type Triage = "normal" | "watch" | "urgent";
export type ConsentState = "pending" | "given" | "stopped";
export type FollowupState = "active" | "paused" | "human" | "ended";
export type Species = "chien" | "chat";

export type Vet = { id: string; name: string; shortName: string };

export type OwnerContact = {
  name: string;
  phone: string;
  role: "principal" | "second";
  consent: ConsentState;
  language: "fr" | "en";
};

export type MessageAuthor = "numa" | "owner" | "vet" | "system";

/**
 * Pièce jointe affichée dans le fil. Données fictives (phase 1) : sans `src`. Données réelles
 * (lot 16) : `src` est un lien de lecture signé, de deux minutes, propre à la personne.
 */
export type Attachment =
  | { kind: "photo"; label: string; src?: string; observations?: string[] }
  | {
      kind: "voice";
      durationLabel: string;
      /** Null tant que la transcription n'est pas faite. */
      transcript: string | null;
      src?: string;
    }
  | { kind: "deleted"; label: string };

export type Message = {
  id: string;
  author: MessageAuthor;
  authorName?: string;
  at: string;
  dayLabel: string;
  text: string;
  attachment?: Attachment;
  triage?: Triage;
};

export type Treatment = { name: string; schedule: string; validatedBy: string };

export type Followup = {
  id: string;
  animal: {
    name: string;
    species: Species;
    breed: string;
    age: string;
    weight: string;
  };
  owners: OwnerContact[];
  procedure: string;
  procedureDate: string;
  protocol: string;
  responsibleVetId: string;
  triage: Triage;
  state: FollowupState;
  dayLabel: string;
  lastActivity: string;
  summaryLine: string;
  controlAppointment: string;
  isPrivate: boolean;
  treatments: Treatment[];
  allergies: string[];
  synthesis?: {
    evolution: string;
    positives: string[];
    negatives: string[];
    alerts: string[];
    openQuestions: string[];
  };
  nextSteps: Array<{ at: string; label: string }>;
  messages: Message[];
};

export type AgendaEvent = {
  id: string;
  time: string;
  duration: string;
  title: string;
  vetId: string;
  kind: "consultation" | "chirurgie" | "controle" | "urgence";
  /** Rendez-vous proposé ou confirmé via Stivea (sinon issu de l'agenda dr.veto). */
  fromStivea: boolean;
  followupId?: string;
};
