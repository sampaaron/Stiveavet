import { describe, expect, it } from "vitest";

import { agendaToday, cabinet, followups, vetById } from "./cabinet-tilleuls";

describe("données fictives du cabinet des Tilleuls", () => {
  it("n'utilise que des numéros des plages réservées à la fiction", () => {
    const phones = [
      cabinet.emergencyPhone,
      cabinet.onCallPhone,
      ...followups.flatMap((followup) =>
        followup.owners.map((owner) => owner.phone),
      ),
    ];

    for (const phone of phones) {
      expect(phone).toMatch(/^(01 99 00|06 39 98) \d{2} \d{2}$/);
    }
  });

  it("identifie chaque suivi par un UUID, jamais par un numéro incrémental", () => {
    for (const followup of followups) {
      expect(followup.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    }
    expect(new Set(followups.map((followup) => followup.id)).size).toBe(
      followups.length,
    );
  });

  it("rattache chaque suivi et chaque rendez-vous à un vétérinaire existant", () => {
    for (const { responsibleVetId } of followups)
      expect(vetById(responsibleVetId)).toBeDefined();
    for (const { vetId } of agendaToday) expect(vetById(vetId)).toBeDefined();
  });

  it("présente Numa comme une IA dès son premier message", () => {
    for (const followup of followups) {
      const firstNumaMessage = followup.messages.find(
        (message) => message.author === "numa",
      );
      if (
        firstNumaMessage &&
        followup.messages.some((m) => m.text.startsWith("Suivi lancé"))
      ) {
        expect(firstNumaMessage.text).toMatch(/assistante IA/);
      }
    }
  });

  it("reste dans la capacité incluse de 10 suivis actifs", () => {
    const active = followups.filter((followup) => followup.state !== "ended");

    expect(active.length).toBeLessThanOrEqual(cabinet.includedActiveFollowups);
  });
});
