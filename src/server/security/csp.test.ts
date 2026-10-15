import { describe, expect, it } from "vitest";

import { buildContentSecurityPolicy, createNonce } from "./csp";

describe("buildContentSecurityPolicy", () => {
  it("n'autorise que l'application elle-même et le nonce de la requête", () => {
    const csp = buildContentSecurityPolicy("abc123", false);

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).not.toMatch(/https?:\/\//);
  });

  it("n'accepte jamais unsafe-eval ni unsafe-inline pour les scripts et les balises style", () => {
    const directives = parseDirectives(
      buildContentSecurityPolicy("abc123", false),
    );

    for (const name of ["script-src", "style-src", "default-src"]) {
      expect(directives.get(name)).not.toContain("'unsafe-inline'");
      expect(directives.get(name)).not.toContain("'unsafe-eval'");
    }
  });

  it("ne tolère le style en ligne que dans les attributs", () => {
    const directives = parseDirectives(
      buildContentSecurityPolicy("abc123", false),
    );

    expect(directives.get("style-src-attr")).toEqual(["'unsafe-inline'"]);
  });

  it("n'ouvre les domaines de Meta qu'à la demande, pour l'inscription WhatsApp", () => {
    const strict = parseDirectives(buildContentSecurityPolicy("abc123", false));
    const meta = parseDirectives(
      buildContentSecurityPolicy("abc123", false, { metaSignup: true }),
    );

    expect(strict.has("frame-src")).toBe(false);
    expect(meta.get("frame-src")).toContain("https://www.facebook.com");
    expect(meta.get("connect-src")).toContain("https://graph.facebook.com");
    // Le reste ne change pas : toujours ni inline, ni eval, ni autre domaine.
    expect(meta.get("script-src")).not.toContain("'unsafe-inline'");
    expect(meta.get("frame-ancestors")).toEqual(["'none'"]);
    for (const values of meta.values())
      for (const value of values)
        if (value.startsWith("https://"))
          expect(value).toMatch(/^https:\/\/[a-z]+\.facebook\.(com|net)$/);
  });

  it("accepte unsafe-eval uniquement en développement", () => {
    expect(buildContentSecurityPolicy("abc123", true)).toContain(
      "'unsafe-eval'",
    );
  });
});

describe("createNonce", () => {
  it("produit une valeur différente à chaque appel", () => {
    const nonces = new Set(Array.from({ length: 100 }, () => createNonce()));

    expect(nonces.size).toBe(100);
  });

  it("produit au moins 128 bits d'aléa encodés en base64", () => {
    expect(createNonce()).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });
});

function parseDirectives(csp: string): Map<string, string[]> {
  return new Map(
    csp.split("; ").map((directive) => {
      const [name = "", ...values] = directive.split(" ");
      return [name, values];
    }),
  );
}
