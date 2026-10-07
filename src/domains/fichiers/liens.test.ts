import { describe, expect, it } from "vitest";

import { LINK_TTL_SECONDS, signReadLink, verifyReadLink } from "./liens";

const secret = "clé-de-test-".repeat(4);
const attachmentId = "6f1c1b7e-2d1a-4c8e-9a54-0c5d3b1f9e01";
const vet = "0b8f2f6e-6f0d-4f57-8f5e-1f6b8f3a2c11";
const assistant = "7d2e3c4b-1a2b-4c3d-8e4f-5a6b7c8d9e0f";
const now = new Date("2026-10-07T10:00:00Z");

function parts(url: string) {
  const parsed = new URL(url, "http://localhost");
  return {
    expires: parsed.searchParams.get("e") ?? "",
    signature: parsed.searchParams.get("s") ?? "",
  };
}

describe("liens de lecture signés", () => {
  const link = signReadLink({ secret, attachmentId, membershipId: vet, now });

  it("valables deux minutes pour ce fichier et ce membre seulement", () => {
    expect(link.url.startsWith(`/app/fichiers/${attachmentId}?`)).toBe(true);
    expect(link.url).not.toContain(vet);
    expect(link.expiresAt.getTime() - now.getTime()).toBe(
      LINK_TTL_SECONDS * 1000,
    );
    const ok = {
      secret,
      attachmentId,
      membershipId: vet,
      now,
      ...parts(link.url),
    };
    expect(verifyReadLink(ok)).toBe(true);
    // Transmis à quelqu'un d'autre : refusé.
    expect(verifyReadLink({ ...ok, membershipId: assistant })).toBe(false);
    // Pour un autre fichier : refusé.
    expect(
      verifyReadLink({
        ...ok,
        attachmentId: "11111111-2222-4333-8444-555555555555",
      }),
    ).toBe(false);
    // Autre clé : refusé.
    expect(verifyReadLink({ ...ok, secret: `${secret}x` })).toBe(false);
  });

  it("périmé, prolongé ou altéré : refusé", () => {
    const ok = { secret, attachmentId, membershipId: vet, ...parts(link.url) };
    expect(
      verifyReadLink({
        ...ok,
        now: new Date(now.getTime() + LINK_TTL_SECONDS * 1000 + 1),
      }),
    ).toBe(false);
    expect(
      verifyReadLink({
        ...ok,
        now,
        expires: String(now.getTime() + 3_600_000),
      }),
    ).toBe(false);
    const tampered = `${ok.signature.startsWith("A") ? "B" : "A"}${ok.signature.slice(1)}`;
    expect(verifyReadLink({ ...ok, now, signature: tampered })).toBe(false);
    expect(verifyReadLink({ ...ok, now, signature: "" })).toBe(false);
    expect(verifyReadLink({ ...ok, now, expires: "demain" })).toBe(false);
  });
});
