import { foldText } from "@/domains/commun/utilitaires";
import { CONTACT_PATTERN } from "@/domains/conversations/guard";

/**
 * Contrôle déterministe des réponses libres de Stive (ADR 0042), appliqué après chaque réponse
 * du modèle, quel que soit le prestataire : les consignes ne suffisent jamais.
 * Stive parle à des professionnels : il peut évoquer des connaissances générales, mais une
 * réponse qui donne un dosage ou une prescription, pose un diagnostic, présente Stive comme
 * un vétérinaire ou un humain, ou contient un lien, une adresse ou un numéro est écartée tout
 * entière. Rien de son texte n'est gardé : l'écran affiche à la place un renvoi sûr.
 * Le poids d'un animal (« un chien de 30 kg ») n'est pas un dosage.
 */

export type StiveGuardReason =
  "dosage" | "prescription" | "diagnosis" | "identity" | "contact" | "length";

export type StiveGuardVerdict =
  { ok: true } | { ok: false; reason: StiveGuardReason };

export const MAX_STIVE_REPLY = 3000;

const UNITS =
  "mg|ml|mcg|µg|ug|ui|iu|milligrammes?|milligrams?|millilitres?|milliliters?|microgrammes?|micrograms?|gouttes?|drops?|comprimes?|cp|cachets?|gelules?|pipettes?|tablets?|pills?|capsules?|doses?|unites?|units?";
const FORMS =
  "comprimes?|cachets?|gelules?|pipettes?|tablets?|pills?|capsules?";
const MEDICATION =
  "comprime|gelule|cachet|pipette|goutte|dose|administr|medicament|medication|medicine|traitement|treatment|antibio|anti-inflammatoire|ains|nsaid|antidouleur|painkiller|injection|tablet|pill";
const FREQUENCY =
  "\\d+\\s*(fois|x)\\s*(par jour|par 24 ?h|\\/ ?j(our)?\\b|a day|per day|daily)";

const RULES: [StiveGuardReason, RegExp][] = [
  [
    "dosage",
    new RegExp(
      [
        // Quantité d'un médicament : « 2 mg », « 0,5 ml », « 3 comprimés ».
        `\\b\\d+([.,]\\d+)?\\s*(${UNITS})\\b`,
        // Dose rapportée au poids ou à la surface : « mg/kg ».
        `\\b(mg|ml|mcg|µg|ug|ui|iu|g)\\s*\\/\\s*(kg|m2|m²)\\b`,
        // « posologie : 2… », « la dose est de 5… ».
        `\\b(posologie|posology|dosage|dosing|dose|doses)\\b[^.\\n]{0,60}\\d`,
        // « un demi-comprimé », « half a tablet ».
        `\\b(un|une|deux|trois|quatre|demi|moitie|quart|half|one|two|three|quarter)[\\s-]+(d'une? |of an? |an? )?(${FORMS})\\b`,
        // Fréquence d'administration d'un médicament, dans la même phrase.
        `(${MEDICATION})[^.\\n]{0,60}${FREQUENCY}`,
        `${FREQUENCY}[^.\\n]{0,60}(${MEDICATION})`,
      ].join("|"),
    ),
  ],
  [
    "prescription",
    new RegExp(
      [
        `\\b(donnez[- ]lui|administrez[- ]lui|prescrivez[- ]lui|redonnez[- ]lui|mettez[- ]l[ea] sous|administrez (du|de la|de l'|des|un|une))\\b`,
        `\\bje (vous )?(conseille|recommande|propose) de (lui )?(donner|administrer|prescrire)\\b`,
        `\\bje prescris\\b`,
        `\\b(give|administer|prescribe) (him|her|it|them)\\b`,
        `\\bi (would )?(recommend|suggest) (giving|administering|prescribing)\\b`,
      ].join("|"),
    ),
  ],
  [
    "diagnosis",
    new RegExp(
      [
        `\\bc'est (probablement |surement |sans doute |certainement |peut-etre |tres probablement )?(une?|de l'|du|de la) ?(infection|allergie|hernie|abces|fracture|torsion|seroma|eventration|otite|cystite|gastro|insuffisance|tumeur|cancer|luxation|dilatation|pancreatite|piroplasmose|leishmaniose|parvovirose)`,
        `\\b(ressemble|fait penser|correspond) (a|a une?|a de l'|au) ?(infection|allergie|hernie|abces|fracture|torsion|seroma|eventration|otite|cystite|gastro|tumeur|cancer|pancreatite)`,
        `\\b(il|elle) souffre d`,
        `\\bmon diagnostic\\b|\\ble diagnostic est\\b`,
        `\\b(he|she|it) (has|is suffering from) (an? )?(infection|allergy|hernia|abscess|fracture|tumou?r|cancer|pancreatitis)`,
        `\\bit'?s (probably |likely |definitely )?(an? )?(infection|allergy|hernia|abscess|fracture|tumou?r|cancer|pancreatitis)`,
        `\\bmy diagnosis\\b|\\bthe diagnosis is\\b`,
      ].join("|"),
    ),
  ],
  [
    "identity",
    new RegExp(
      [
        `\\b(je suis|moi,? c'est) (le |la |un |une |votre )?(docteur|dr|veterinaire|veto|humain|humaine|personne reelle)\\b`,
        `\\b(i am|i'm) (the |a |an |your )?(vet|veterinarian|veterinary surgeon|doctor|human|real person)\\b`,
      ].join("|"),
    ),
  ],
  ["contact", CONTACT_PATTERN],
];

/** Dates et heures écrites en chiffres : jamais prises pour un numéro. */
const DATES = /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[h:]\d{2}\b/g;

export function checkStiveReply(text: string): StiveGuardVerdict {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > MAX_STIVE_REPLY)
    return { ok: false, reason: "length" };
  const folded = foldText(trimmed);
  for (const [reason, pattern] of RULES) {
    const subject = reason === "contact" ? folded.replace(DATES, " ") : folded;
    if (pattern.test(subject)) return { ok: false, reason };
  }
  return { ok: true };
}
