import { describe, expect, it } from "vitest";

import type { PermissionKey } from "@/domains/equipe/permissions";

import {
  firstContactAt,
  firstContactHours,
  isPastStep,
  maskedPhone,
  sheetInput,
  suggestProtocol,
} from "./plan";
import {
  canLaunchFollowup,
  canPrepareFollowup,
  canSteerFollowup,
} from "./policies";

const procedureAt = new Date("2026-10-07T08:00:00Z");

describe("fiche de lancement", () => {
  it("premier message : suggestion en heures après l'intervention, jamais négative", () => {
    const at = firstContactAt(procedureAt, 3);
    expect(at).toEqual(new Date("2026-10-07T11:00:00Z"));
    expect(firstContactHours(procedureAt, at)).toBe(3);
    expect(
      firstContactHours(procedureAt, new Date("2026-10-07T07:00:00Z")),
    ).toBe(0);
    expect(sheetInput.shape.firstContactHours.safeParse(-1).success).toBe(
      false,
    );
    expect(sheetInput.shape.firstContactHours.safeParse(169).success).toBe(
      false,
    );
  });

  it("une étape dont l'heure est passée est verrouillée", () => {
    const now = new Date("2026-10-08T08:00:00Z");
    expect(isPastStep(procedureAt, 24, now)).toBe(true);
    expect(isPastStep(procedureAt, 25, now)).toBe(false);
  });

  it("propose le protocole qui correspond à l'intervention et à l'espèce", () => {
    const candidates = [
      {
        versionId: "chienne",
        name: "Stérilisation de la chienne",
        description: "Suivi après ovariectomie de la chienne.",
        species: "dog" as const,
      },
      {
        versionId: "chatte",
        name: "Stérilisation de la chatte",
        description: "Suivi après ovariectomie : réveil, appétit.",
        species: "cat" as const,
      },
      {
        versionId: "dents",
        name: "Détartrage et soins dentaires",
        description: "Après un détartrage sous anesthésie.",
        species: "both" as const,
      },
    ];
    expect(suggestProtocol("Ovariectomie", "cat", candidates)).toBe("chatte");
    expect(suggestProtocol("Ovariectomie", "dog", candidates)).toBe("chienne");
    expect(
      suggestProtocol("Détartrage sous anesthésie", "dog", candidates),
    ).toBe("dents");
    expect(suggestProtocol("Radiographie", "dog", candidates)).toBeNull();
  });

  it("masque les numéros", () => {
    expect(maskedPhone("+33639980101")).toBe("•• •• •• •• 01");
  });
});

describe("droits de lancement", () => {
  const viewer = (
    role: "admin_vet" | "vet" | "assistant",
    permissions: PermissionKey[],
  ) => ({
    membershipId: "m1",
    role,
    permissions: new Set<PermissionKey>(permissions),
  });
  const vet = viewer("vet", ["followups.launch", "clinical.read"]);
  const assistant = viewer("assistant", ["followups.launch", "clinical.read"]);

  it("un assistant autorisé prépare ; seul un vétérinaire décide et lance", () => {
    expect(canPrepareFollowup(assistant, "clinical")).toBe(true);
    expect(canSteerFollowup(assistant, "clinical")).toBe(false);
    expect(canLaunchFollowup(assistant, "clinical", "m1")).toBe(false);
    expect(canSteerFollowup(vet, "clinical")).toBe(true);
    expect(canLaunchFollowup(vet, "clinical", "m1")).toBe(true);
  });

  it("le lancement revient au vétérinaire responsable, avec l'accès clinique", () => {
    expect(canLaunchFollowup(vet, "clinical", "m2")).toBe(false);
    expect(canPrepareFollowup(vet, "summary")).toBe(false);
    expect(
      canPrepareFollowup(viewer("vet", ["clinical.read"]), "clinical"),
    ).toBe(false);
  });
});
