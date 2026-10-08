import { describe, expect, it } from "vitest";

import { openerPolicyRules, staticSecurityHeaders } from "./headers";

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

describe("openerPolicyRules", () => {
  it("isole les fenêtres partout, sauf pour la fenêtre de Meta des pages de connexion", () => {
    const [strict, signup] = openerPolicyRules;
    const matches = (source: string, path: string) =>
      new RegExp(`^${source.replace(":page", "")}$`).test(path);

    expect(strict?.headers[0]?.value).toBe("same-origin");
    expect(signup?.headers[0]?.value).toBe("same-origin-allow-popups");
    for (const path of ["/app", "/app/suivis/1", "/app/reglages/x", "/"])
      expect(matches(strict?.source ?? "", path)).toBe(true);
    expect(matches(strict?.source ?? "", "/app/reglages")).toBe(false);
  });
});
