import { describe, expect, it } from "vitest";

import { clientIp } from "./client-ip";

describe("adresse IP du client", () => {
  it("ignorée sans proxy de confiance, même si l'en-tête est présent", () => {
    expect(clientIp("203.0.113.7", false)).toBeNull();
  });

  it("derrière le proxy, seule la dernière adresse ajoutée compte", () => {
    // Les premières valeurs viennent du client et sont falsifiables.
    expect(clientIp("10.0.0.1, 198.51.100.4,203.0.113.7 ", true)).toBe(
      "203.0.113.7",
    );
    expect(clientIp("2001:db8::1", true)).toBe("2001:db8::1");
  });

  it("refuse une valeur absente ou qui n'est pas une adresse IP", () => {
    expect(clientIp(null, true)).toBeNull();
    expect(clientIp("", true)).toBeNull();
    expect(clientIp("203.0.113.7, inconnu", true)).toBeNull();
    expect(clientIp("203.0.113.7,", true)).toBeNull();
  });
});
