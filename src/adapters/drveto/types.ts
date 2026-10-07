/** Connexion au logiciel vétérinaire dr.veto (lecture seule, ADR 0004 et 0015). */

/** Résultat de recherche : de quoi reconnaître l'animal, sans donnée clinique détaillée. */
export type DrVetoAnimalHit = {
  /** Identifiant de l'animal dans dr.veto. */
  ref: string;
  name: string;
  species: "dog" | "cat";
  breed: string | null;
  ownerNames: string[];
  lastProcedure: string;
  lastProcedureAt: Date;
};

export type DrVetoOwner = {
  fullName: string;
  /** Numéro WhatsApp, au format international. Jamais journalisé. */
  phone: string;
  language: "fr" | "en";
};

export type DrVetoTreatment = {
  name: string;
  /** Posologie telle que prescrite par le vétérinaire dans dr.veto. */
  instructions: string;
};

/**
 * Résumé utile importé pour un suivi (cahier des charges §4.3), jamais les notes brutes du
 * dossier (architecture §11).
 */
export type DrVetoRecord = {
  ref: string;
  animal: {
    name: string;
    species: "dog" | "cat";
    breed: string | null;
    /** Date de naissance `AAAA-MM-JJ`. */
    birthDate: string | null;
    weightGrams: number | null;
  };
  owners: DrVetoOwner[];
  procedure: { label: string; at: Date };
  controlAppointmentAt: Date | null;
  allergies: string[];
  antecedents: string[];
  treatments: DrVetoTreatment[];
};

export type DrVetoConnector = {
  readonly simulated: boolean;
  connectPractice(practiceCode: string): Promise<{ displayLabel: string }>;
  /** Recherche par nom de l'animal, nom du propriétaire ou identifiant dr.veto. */
  searchAnimals(query: string): Promise<DrVetoAnimalHit[]>;
  /** Résumé utile d'un animal ; null s'il n'existe pas. */
  importRecord(ref: string): Promise<DrVetoRecord | null>;
};
