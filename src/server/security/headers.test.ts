import { describe, expect, it } from "vitest";

import { staticSecurityHeaders } from "./headers";

describe("staticSecurityHeaders", () => {
  const byName = new Map(
    staticSecurityHeaders.map(({ key, value }) => [key, value]),
  );

  it("impose HTTPS, interdit l'intégration en iframe et le reniflage de type", () => {
    expect(byName.get("Strict-Transport-Security")).toContain(
      "max-age=63072000",
    );
    expect(byName.get("X-Frame-Options")).toBe("DENY");
    expect(byName.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("coupe caméra, micro, géolocalisation et paiement côté navigateur", () => {
    const policy = byName.get("Permissions-Policy");

    for (const feature of ["camera", "microphone", "geolocation", "payment"]) {
      expect(policy).toContain(`${feature}=()`);
    }
  });
});
