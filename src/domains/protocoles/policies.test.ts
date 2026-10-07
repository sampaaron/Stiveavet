import { describe, expect, it } from "vitest";

import { ROLE_PERMISSIONS } from "@/domains/equipe/permissions";
import type { MemberRole } from "@/domains/auth/repository";

import {
  canBrowseProtocols,
  canCreateProtocol,
  canEditProtocol,
  canReadProtocol,
  canValidateProtocol,
} from "./policies";

const viewer = (role: MemberRole, membershipId = "moi") => ({
  membershipId,
  role,
  permissions: new Set(ROLE_PERMISSIONS[role].defaults),
});
const cabinet = { ownerMembershipId: null };
const mine = { ownerMembershipId: "moi" };
const colleague = { ownerMembershipId: "confrere" };

describe("droits sur les protocoles (valeurs par défaut des rôles)", () => {
  it("l'administrateur gère ceux du cabinet et voit les protocoles personnels sans les modifier", () => {
    const admin = viewer("admin_vet");
    expect(canEditProtocol(admin, cabinet)).toBe(true);
    expect(canValidateProtocol(admin, cabinet)).toBe(true);
    expect(canReadProtocol(admin, colleague)).toBe(true);
    expect(canEditProtocol(admin, colleague)).toBe(false);
  });

  it("un vétérinaire lit ceux du cabinet et gère seulement les siens", () => {
    const vet = viewer("vet");
    expect(canReadProtocol(vet, cabinet)).toBe(true);
    expect(canEditProtocol(vet, cabinet)).toBe(false);
    expect(canEditProtocol(vet, mine)).toBe(true);
    expect(canValidateProtocol(vet, mine)).toBe(true);
    expect(canReadProtocol(vet, colleague)).toBe(false);
    expect(canCreateProtocol(vet, "personal")).toBe(true);
    expect(canCreateProtocol(vet, "cabinet")).toBe(false);
  });

  it("un assistant n'a pas accès aux protocoles par défaut", () => {
    const assistant = viewer("assistant");
    expect(canBrowseProtocols(assistant)).toBe(false);
    expect(canReadProtocol(assistant, cabinet)).toBe(false);
  });

  it("un assistant à qui l'on ouvre le lancement de suivis lit les protocoles sans jamais les valider", () => {
    const assistant = {
      ...viewer("assistant"),
      permissions: new Set([
        ...ROLE_PERMISSIONS.assistant.defaults,
        "followups.launch" as const,
      ]),
    };
    expect(canReadProtocol(assistant, cabinet)).toBe(true);
    expect(canValidateProtocol(assistant, cabinet)).toBe(false);
    expect(canCreateProtocol(assistant, "personal")).toBe(false);
  });
});
