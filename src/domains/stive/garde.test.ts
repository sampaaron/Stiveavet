import { describe, expect, it } from "vitest";

import { MAX_STIVE_REPLY, checkStiveReply } from "./garde";

describe("contrôle des réponses libres de Stive", () => {
  it.each([
    "Le méloxicam se donne à 0,1 mg/kg une fois par jour.",
    "Comptez 2 mg par kilo, puis 1 mg le lendemain.",
    "La posologie habituelle est de 5 à 10 par jour.",
    "Il faut donner un demi-comprimé matin et soir.",
    "Administrer 0.5 ml en sous-cutané.",
    "En général, 20 mcg suffisent.",
    "Antibiotique 2 fois par jour pendant sept jours.",
    "Dose: 4 drops in each ear.",
    "Give half a tablet with food.",
  ])("écarte un dosage : « %s »", (text) => {
    expect(checkStiveReply(text)).toEqual({ ok: false, reason: "dosage" });
  });

  it.each([
    "Donnez-lui un anti-inflammatoire ce soir.",
    "Je vous recommande de lui donner de l'amoxicilline.",
    "I would recommend giving amoxicillin.",
  ])("écarte une prescription : « %s »", (text) => {
    expect(checkStiveReply(text)).toEqual({
      ok: false,
      reason: "prescription",
    });
  });

  it.each([
    "D'après ce que vous décrivez, c'est probablement une infection de la plaie.",
    "Ça ressemble à une otite.",
    "It's probably an abscess.",
  ])("écarte un diagnostic : « %s »", (text) => {
    expect(checkStiveReply(text)).toEqual({ ok: false, reason: "diagnosis" });
  });

  it.each([
    "Je suis vétérinaire, faites-moi confiance.",
    "I'm a vet, trust me.",
  ])("écarte une fausse identité : « %s »", (text) => {
    expect(checkStiveReply(text)).toEqual({ ok: false, reason: "identity" });
  });

  it.each([
    "Voyez https://exemple.test/guide pour la suite.",
    "Écrivez à accueil@exemple.test.",
    "Appelez le 06 12 34 56 78.",
  ])("écarte un lien, une adresse ou un numéro : « %s »", (text) => {
    expect(checkStiveReply(text)).toEqual({ ok: false, reason: "contact" });
  });

  it.each([
    // Le métier, l'accompagnement des propriétaires, l'organisation : bienvenus.
    "Pour annoncer une complication, commencez par ce que vous avez constaté, puis laissez le propriétaire poser ses questions.",
    "Pour un chien de 30 kg opéré d'une TPLO, les points à vérifier à J+3 sont la plaie, l'appui et l'appétit ; l'examen et la décision vous reviennent.",
    "En tant que vétérinaire, vous restez seul juge : vérifiez la posologie dans le RCP du médicament.",
    "Il s'agit surtout d'organiser les rappels : un message à J+1, une photo à J+3.",
    "Le rendez-vous de contrôle est le 2026-10-25 à 14:30.",
    "Je suis Stive, une IA : je ne pose pas de diagnostic.",
    "I'm Stive, an AI assistant: the decision is yours.",
  ])("laisse passer « %s »", (text) => {
    expect(checkStiveReply(text)).toEqual({ ok: true });
  });

  it("une réponse vide ou trop longue est écartée", () => {
    expect(checkStiveReply("   ")).toEqual({ ok: false, reason: "length" });
    expect(checkStiveReply("a".repeat(MAX_STIVE_REPLY + 1))).toEqual({
      ok: false,
      reason: "length",
    });
  });
});
