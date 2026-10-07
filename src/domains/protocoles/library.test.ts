import { describe, expect, it } from "vitest";

import { protocolContentInput } from "./content";
import { PROTOCOL_LIBRARY } from "./library";

describe("bibliothèque de protocoles", () => {
  it("chaque modèle est un contenu valide, avec une clé unique", () => {
    const keys = new Set<string>();
    for (const protocol of PROTOCOL_LIBRARY) {
      expect(
        protocolContentInput.safeParse(protocol).success,
        protocol.key,
      ).toBe(true);
      expect(protocol.key).toMatch(/^[a-z0-9-]{1,64}$/);
      expect(keys.has(protocol.key)).toBe(false);
      keys.add(protocol.key);
    }
  });

  it("aucun modèle ne fixe de posologie ni de diagnostic", () => {
    const text = JSON.stringify(PROTOCOL_LIBRARY).toLowerCase();
    for (const forbidden of ["mg/kg", "comprimé", "diagnostic", "posologie de"])
      expect(text).not.toContain(forbidden);
  });
});
