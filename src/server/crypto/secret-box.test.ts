import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { SecretBoxError, parseSecretKeys, secretBox } from "./secret-box";

const keyA = randomBytes(32).toString("base64");
const keyB = randomBytes(32).toString("base64");

describe("coffre des secrets", () => {
  it("chiffre et déchiffre dans le même contexte, jamais en clair", () => {
    const box = secretBox(parseSecretKeys(`k1:${keyA}`));
    const sealed = box.seal("EAAG-jeton-fictif", "whatsapp:org-1");
    expect(sealed).not.toContain("jeton");
    expect(sealed.startsWith("v1.k1.")).toBe(true);
    expect(box.open(sealed, "whatsapp:org-1")).toBe("EAAG-jeton-fictif");
    // Deux chiffrements du même secret diffèrent (vecteur aléatoire).
    expect(box.seal("EAAG-jeton-fictif", "whatsapp:org-1")).not.toBe(sealed);
  });

  it("refuse un autre contexte, un chiffré modifié ou une clé inconnue", () => {
    const box = secretBox(parseSecretKeys(`k1:${keyA}`));
    const sealed = box.seal("secret", "whatsapp:org-1");
    expect(() => box.open(sealed, "whatsapp:org-2")).toThrow(SecretBoxError);
    const parts = sealed.split(".");
    parts[3] = Buffer.from("autre").toString("base64url");
    expect(() => box.open(parts.join("."), "whatsapp:org-1")).toThrow(
      SecretBoxError,
    );
    const other = secretBox(parseSecretKeys(`k2:${keyB}`));
    expect(() => other.open(sealed, "whatsapp:org-1")).toThrow(SecretBoxError);
    expect(() => box.open("n'importe quoi", "whatsapp:org-1")).toThrow(
      "Secret illisible",
    );
  });

  it("rotation : la nouvelle clé chiffre, l'ancienne déchiffre encore", () => {
    const before = secretBox(parseSecretKeys(`k1:${keyA}`));
    const sealed = before.seal("secret", "ctx");
    const after = secretBox(parseSecretKeys(`k2:${keyB},k1:${keyA}`));
    expect(after.open(sealed, "ctx")).toBe("secret");
    expect(after.seal("secret", "ctx").startsWith("v1.k2.")).toBe(true);
  });

  it("une configuration invalide ne révèle que le nom de la variable", () => {
    for (const value of [
      undefined,
      "",
      "k1",
      "k1:court",
      `K1:${keyA}`,
      `k1:${keyA},k1:${keyB}`,
    ])
      expect(() => parseSecretKeys(value)).toThrow(
        "Configuration invalide : SECRETS_ENCRYPTION_KEYS",
      );
  });
});
