import { describe, expect, it } from "vitest";

import { checkNumaReply, safeFallback } from "./guard";

describe("garde-fous de Numa : contenu", () => {
  it.each([
    "Prenez rendez-vous sur https://exemple.test/rdv.",
    "Tout est expliqué sur www.exemple.test.",
    "Voyez le site clinique-exemple.fr pour la suite.",
    "Écrivez à accueil@exemple.test, l'équipe vous répondra.",
    "Write to front-desk@clinic.example.org for help.",
    "Appelez le 06 12 34 56 78 si besoin.",
    "Votre code est 482913.",
    "Call +33 6 12 34 56 78 now.",
    "Bonjour, je suis le Dr Martin.",
    "Je suis votre vétérinaire, je m'en occupe.",
    "Ici le docteur de garde.",
    "En tant que vétérinaire, je vous le confirme.",
    "Hello, I am the vet looking after Plume.",
    "I'm your veterinarian.",
    "This is Dr Martin.",
    "Speaking as a doctor, I can tell you more.",
  ])("refuse « %s »", (text) => {
    expect(checkNumaReply(text)).toEqual({ ok: false, reason: "content" });
  });

  it.each([
    "Je suis Numa, l'assistante IA du cabinet : seul le vétérinaire peut répondre.",
    "I'm Numa, the clinic's AI assistant: only the vet can answer this.",
    "Merci pour ces nouvelles de Plume, c'est noté pour l'équipe.",
    "Le rendez-vous de contrôle est prévu le 12 octobre à 14 h.",
    "Pouvez-vous envoyer une photo de la plaie, jour 3 ?",
    "Your check-up is on 12 October at 2 pm.",
  ])("laisse passer « %s »", (text) => {
    expect(checkNumaReply(text)).toEqual({ ok: true });
  });

  it("le message de remplacement passe toujours", () => {
    expect(checkNumaReply(safeFallback("fr", "Clinique des Tilleuls"))).toEqual(
      { ok: true },
    );
    expect(checkNumaReply(safeFallback("en", "Clinique des Tilleuls"))).toEqual(
      { ok: true },
    );
  });
});
