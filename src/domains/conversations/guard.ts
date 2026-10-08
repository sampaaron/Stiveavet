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

const RULES: [GuardReason, RegExp][] = [
  [
    "dosage",
    /\b\d+([.,]\d+)?\s*(mg|ml|g|mcg|ug|ui|kg|gouttes?|comprimes?|cp|cachets?|gelules?|pipettes?|doses?|drops?|tablets?|pills?|capsules?)\b|\b(un|une|deux|trois|demi|moitie|half|one|two)\s+(comprimes?|cachets?|gelules?|doses?|tablets?|pills?)\b|\b(mg|ml)\s*\/\s*kg\b/,
  ],
  [
    "prescription",
    /\b(donnez[- ]lui|donnez|administrez|augmentez|diminuez|doublez|redonnez|arretez (le|son) traitement|interrompez|appliquez|give (him|her|it|them)|administer|increase the|decrease the|double the|stop (the|his|her) (treatment|medication))\b/,
  ],
  [
    "diagnosis",
    /\b(c'est (probablement |surement |sans doute |certainement |peut-etre )?(une?|de l'|du) ?(infection|allergie|hernie|abces|fracture|torsion|seroma|eventration|otite|cystite|gastro)|il (s'agit|souffre) d|elle (s'agit|souffre) d|mon diagnostic|le diagnostic est|it'?s (probably |likely |definitely )?(an? )?(infection|allergy|hernia|abscess|fracture)|(he|she) (has|is suffering from) (an? )?(infection|allergy|hernia))/,
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
