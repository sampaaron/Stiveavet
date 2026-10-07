import type { DrVetoAnimalHit, DrVetoConnector, DrVetoRecord } from "./types";

/**
 * Simulation : aucun appel réseau ; le code du cabinet n'est jamais conservé en clair.
 * Les animaux sont fictifs, les numéros sont dans la plage réservée à la fiction par l'ARCEP
 * (06 39 98 xx xx) et les posologies sont des exemples à valider par un vétérinaire.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

type FakeAnimal = Omit<DrVetoRecord, "procedure" | "controlAppointmentAt"> & {
  procedure: { label: string; hoursAgo: number };
  controlInDays: number | null;
};

const ANIMALS: readonly FakeAnimal[] = [
  {
    ref: "DV-20481",
    animal: {
      name: "Plume",
      species: "cat",
      breed: "Européen",
      birthDate: "2025-03-02",
      weightGrams: 3200,
    },
    owners: [
      { fullName: "Margaux Lemaire", phone: "+33639980101", language: "fr" },
    ],
    procedure: { label: "Ovariectomie", hoursAgo: 2 },
    controlInDays: 10,
    allergies: [],
    antecedents: ["Coryza à 4 mois, guéri"],
    treatments: [
      {
        name: "Anti-inflammatoire (exemple fictif)",
        instructions: "1 comprimé le matin pendant 3 jours, au cours du repas",
      },
    ],
  },
  {
    ref: "DV-20517",
    animal: {
      name: "Gaston",
      species: "dog",
      breed: "Beagle",
      birthDate: "2019-07-14",
      weightGrams: 13800,
    },
    owners: [
      { fullName: "Antoine Girard", phone: "+33639980102", language: "fr" },
      { fullName: "Chloé Girard", phone: "+33639980103", language: "fr" },
    ],
    procedure: { label: "Détartrage sous anesthésie", hoursAgo: 3 },
    controlInDays: 7,
    allergies: ["Pénicillines (exemple fictif)"],
    antecedents: ["Souffle cardiaque léger, suivi annuel"],
    treatments: [
      {
        name: "Antibiotique (exemple fictif)",
        instructions: "1 comprimé matin et soir pendant 7 jours",
      },
      {
        name: "Gel buccal (exemple fictif)",
        instructions: "Application sur les gencives le soir pendant 10 jours",
      },
    ],
  },
  {
    ref: "DV-20533",
    animal: {
      name: "Sésame",
      species: "dog",
      breed: "Berger australien",
      birthDate: "2024-01-20",
      weightGrams: 21500,
    },
    owners: [
      { fullName: "Julie Moreau", phone: "+33639980104", language: "fr" },
    ],
    procedure: { label: "Ovariectomie", hoursAgo: 1 },
    controlInDays: 10,
    allergies: [],
    antecedents: [],
    treatments: [
      {
        name: "Anti-inflammatoire (exemple fictif)",
        instructions: "Selon l'ordonnance remise à la sortie",
      },
    ],
  },
  {
    ref: "DV-20560",
    animal: {
      name: "Tango",
      species: "cat",
      breed: "Maine coon",
      birthDate: "2021-05-09",
      weightGrams: 6900,
    },
    owners: [
      { fullName: "Emily Carter", phone: "+33639980105", language: "en" },
    ],
    procedure: { label: "Castration", hoursAgo: 4 },
    controlInDays: null,
    allergies: [],
    antecedents: ["Calculs urinaires en 2024"],
    treatments: [],
  },
  {
    ref: "DV-20574",
    animal: {
      name: "Biscotte",
      species: "dog",
      breed: "Jack Russell",
      birthDate: "2016-11-30",
      weightGrams: 7400,
    },
    owners: [{ fullName: "René Fabre", phone: "+33639980106", language: "fr" }],
    procedure: { label: "Suivi de traitement", hoursAgo: 24 },
    controlInDays: 14,
    allergies: ["Anesthésique local (exemple fictif)"],
    antecedents: ["Insuffisance rénale débutante"],
    treatments: [
      {
        name: "Traitement de fond (exemple fictif)",
        instructions: "1/2 comprimé chaque matin, sans interruption",
      },
    ],
  },
  {
    ref: "DV-20598",
    animal: {
      name: "Praline",
      species: "cat",
      breed: "Sacré de Birmanie",
      birthDate: "2022-08-18",
      weightGrams: 4100,
    },
    owners: [
      { fullName: "Hélène Roche", phone: "+33639980107", language: "fr" },
      { fullName: "Bastien Roche", phone: "+33639980108", language: "fr" },
    ],
    procedure: { label: "Ovariectomie", hoursAgo: 2 },
    controlInDays: 10,
    allergies: [],
    antecedents: [],
    treatments: [
      {
        name: "Anti-inflammatoire (exemple fictif)",
        instructions: "1 dose orale le soir pendant 4 jours",
      },
    ],
  },
  {
    ref: "DV-20612",
    animal: {
      name: "Nougat",
      species: "cat",
      breed: "Européen",
      birthDate: "2023-02-14",
      weightGrams: 3600,
    },
    owners: [
      { fullName: "Inès Marchal", phone: "+33639980109", language: "fr" },
    ],
    procedure: { label: "Ovariectomie", hoursAgo: 3 },
    controlInDays: 10,
    allergies: [],
    antecedents: [],
    treatments: [],
  },
  {
    ref: "DV-20627",
    animal: {
      name: "Olive",
      species: "cat",
      breed: "Chartreux",
      birthDate: "2022-06-01",
      weightGrams: 3900,
    },
    owners: [
      { fullName: "Oliver Hughes", phone: "+33639980110", language: "en" },
    ],
    procedure: { label: "Ovariectomie", hoursAgo: 3 },
    controlInDays: 10,
    allergies: [],
    antecedents: [],
    treatments: [],
  },
  {
    ref: "DV-20641",
    animal: {
      name: "Pistache",
      species: "cat",
      breed: "Européen",
      birthDate: "2023-09-03",
      weightGrams: 3300,
    },
    owners: [
      { fullName: "Lucie Perrin", phone: "+33639980111", language: "fr" },
    ],
    procedure: { label: "Ovariectomie", hoursAgo: 3 },
    controlInDays: 10,
    allergies: [],
    antecedents: [],
    treatments: [],
  },
  {
    ref: "DV-20655",
    animal: {
      name: "Mistral",
      species: "cat",
      breed: "Maine coon",
      birthDate: "2021-04-22",
      weightGrams: 5200,
    },
    owners: [
      { fullName: "Grace Miller", phone: "+33639980112", language: "en" },
    ],
    procedure: { label: "Ovariectomie", hoursAgo: 3 },
    controlInDays: 10,
    allergies: [],
    antecedents: [],
    treatments: [],
  },
  {
    ref: "DV-20669",
    animal: {
      name: "Moka",
      species: "cat",
      breed: "Européen",
      birthDate: "2024-05-12",
      weightGrams: 3100,
    },
    owners: [
      { fullName: "Camille Dubois", phone: "+33639980113", language: "fr" },
    ],
    procedure: { label: "Ovariectomie", hoursAgo: 3 },
    controlInDays: 10,
    allergies: [],
    antecedents: [],
    treatments: [],
  },
  {
    ref: "DV-20683",
    animal: {
      name: "Maple",
      species: "cat",
      breed: "British shorthair",
      birthDate: "2023-11-08",
      weightGrams: 4300,
    },
    owners: [
      { fullName: "Harry Collins", phone: "+33639980114", language: "en" },
    ],
    procedure: { label: "Ovariectomie", hoursAgo: 3 },
    controlInDays: 10,
    allergies: [],
    antecedents: [],
    treatments: [],
  },
];

/** Minuscules sans accents, pour une recherche tolérante. */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/** Heure de l'intervention : arrondie au quart d'heure, pour des fiches lisibles. */
function hoursBefore(now: Date, hours: number): Date {
  const at = new Date(now.getTime() - hours * HOUR);
  at.setUTCMinutes(Math.floor(at.getUTCMinutes() / 15) * 15, 0, 0);
  return at;
}

function toRecord(entry: FakeAnimal, now: Date): DrVetoRecord {
  const at = hoursBefore(now, entry.procedure.hoursAgo);
  let control: Date | null = null;
  if (entry.controlInDays !== null) {
    control = new Date(at.getTime() + entry.controlInDays * DAY);
    // Rendez-vous de contrôle à 10 h (heure d'hiver de Paris, à l'heure près).
    control.setUTCHours(9, 0, 0, 0);
  }
  return {
    ref: entry.ref,
    animal: { ...entry.animal },
    owners: entry.owners.map((owner) => ({ ...owner })),
    procedure: { label: entry.procedure.label, at },
    controlAppointmentAt: control,
    allergies: [...entry.allergies],
    antecedents: [...entry.antecedents],
    treatments: entry.treatments.map((treatment) => ({ ...treatment })),
  };
}

export function createFakeDrVeto(
  clock: () => Date = () => new Date(),
): DrVetoConnector {
  return {
    simulated: true,
    async connectPractice(practiceCode) {
      return {
        displayLabel: `Cabinet ${practiceCode.slice(0, 2).toUpperCase()}••• (simulé)`,
      };
    },
    async searchAnimals(query) {
      const needle = normalize(query);
      if (needle.length < 2) return [];
      const now = clock();
      return ANIMALS.filter((entry) =>
        [entry.ref, entry.animal.name, ...entry.owners.map((o) => o.fullName)]
          .map(normalize)
          .some((value) => value.includes(needle)),
      )
        .slice(0, 10)
        .map((entry): DrVetoAnimalHit => {
          const record = toRecord(entry, now);
          return {
            ref: record.ref,
            name: record.animal.name,
            species: record.animal.species,
            breed: record.animal.breed,
            ownerNames: record.owners.map((owner) => owner.fullName),
            lastProcedure: record.procedure.label,
            lastProcedureAt: record.procedure.at,
          };
        });
    },
    async importRecord(ref) {
      const entry = ANIMALS.find((candidate) => candidate.ref === ref);
      return entry ? toRecord(entry, clock()) : null;
    },
  };
}

export const fakeDrVeto: DrVetoConnector = createFakeDrVeto();
