import { foldText } from "@/domains/commun";

/**
 * Garde-fous déterministes de Numa (cahier des charges §3, architecture §10) : appliqués à
 * toute réponse de la passerelle IA avant envoi, quel que soit le prestataire. Une réponse
 * qui ressemble à un dosage, une prescription, un diagnostic ou une réassurance médicale est
 * remplacée par un message sûr qui renvoie au vétérinaire.
 */
export type GuardReason =
  "dosage" | "prescription" | "diagnosis" | "reassurance" | "length";

export type GuardVerdict = { ok: true } | { ok: false; reason: GuardReason };

const MAX_NUMA_REPLY = 1000;

const UNITS =
  "mg|ml|g|mcg|ug|ui|kg|milligrammes?|milligrams?|millilitres?|milliliters?|grammes?|grams?|microgrammes?|gouttes?|comprimes?|cp|cachets?|gelules?|pipettes?|doses?|drops?|tablets?|pills?|capsules?";
const FORMS =
  "comprimes?|cachets?|gelules?|doses?|pipettes?|tablets?|pills?|capsules?";
const DRUGS =
  "traitement|medicaments?|antibiotiques?|anti-inflammatoires?|antidouleurs?|comprimes?|treatment|medications?|medicines?|antibiotics?|painkillers?|tablets?|pills?";
const CONDITIONS_FR =
  "infection|allergie|hernie|abces|fracture|torsion|seroma|eventration|otite|cystite|gastro";
const CONDITIONS_EN = "infection|allergy|hernia|abscess|fracture";

const RULES: [GuardReason, RegExp][] = [
  [
    "dosage",
    new RegExp(
      [
        `\\b\\d+([.,]\\d+)?\\s*(${UNITS})\\b`,
        `\\b(un|une|deux|trois|quatre|demi|moitie|quart|half|one|two|three|quarter)[\\s-]+(d'une? |of an? |an? )?(${FORMS})\\b`,
        `\\b(mg|ml)\\s*\\/\\s*kg\\b`,
      ].join("|"),
    ),
  ],
  [
    "prescription",
    new RegExp(
      [
        `\\b(donnez[- ]lui|donnez|administrez|augmentez|diminuez|doublez|redonnez|arretez (le|son) traitement|interrompez|appliquez|give (him|her|it|them)|administer|increase the|decrease the|double the)\\b`,
        // « Vous pouvez lui donner… », « il peut prendre… », « you can give… ».
        `\\b(vous pouvez|vous devez|il faut|il peut|elle peut|you can|you may|you should|he can|she can)\\s+(lui |le |la |les |him |her )?(donner|redonner|administrer|arreter|stopper|suspendre|reprendre|augmenter|diminuer|prendre|give|stop|administer|increase|reduce|take|resume)\\b`,
        `\\b(arreter|arretez|stopper|stoppez|suspendre|suspendez|interrompre|stop|pause)\\s+(le|la|les|son|sa|ses|the|his|her)\\s+(${DRUGS})\\b`,
      ].join("|"),
    ),
  ],
  [
    "diagnosis",
    new RegExp(
      [
        `\\bc'est (probablement |surement |sans doute |certainement |peut-etre )?(une?|de l'|du) ?(${CONDITIONS_FR})`,
        `\\b(ressemble|fait penser|correspond) a (une?|de l'|du) ?(${CONDITIONS_FR})`,
        `\\b(il|elle) (s'agit|souffre) d`,
        `\\bmon diagnostic|\\ble diagnostic est`,
        `\\bit'?s (probably |likely |definitely )?(an? )?(${CONDITIONS_EN})`,
        `\\b(looks|sounds|seems) like (an? )?(${CONDITIONS_EN})`,
        `\\b(he|she) (has|is suffering from) (an? )?(${CONDITIONS_EN})`,
      ].join("|"),
    ),
  ],
  [
    "reassurance",
    /(rien de grave|ce n'est pas grave|c'est pas grave|pas grave|aucune inquietude|pas d'inquietude|ne vous inquietez pas|inutile de vous inquieter|tout va bien|c'est normal|c'est tout a fait normal|pas de souci a se faire|nothing serious|nothing to worry|don'?t worry|no need to worry|it'?s normal|perfectly normal|everything is fine)/,
  ],
];

export function checkNumaReply(text: string): GuardVerdict {
  if (text.length === 0 || text.length > MAX_NUMA_REPLY)
    return { ok: false, reason: "length" };
  const normalized = foldText(text);
  for (const [reason, pattern] of RULES)
    if (pattern.test(normalized)) return { ok: false, reason };
  return { ok: true };
}

/** Remplaçant sûr d'une réponse refusée. */
export function safeFallback(
  language: "fr" | "en",
  practiceName: string,
): string {
  return language === "en"
    ? `I'm passing your message on to the ${practiceName} team: only the vet can answer it. In an emergency, call the clinic directly.`
    : `Je transmets votre message à l'équipe de ${practiceName} : seul le vétérinaire peut y répondre. En cas d'urgence, appelez directement le cabinet.`;
}
