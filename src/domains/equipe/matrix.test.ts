import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { followupAccess } from "@/domains/suivis/policies";
import type { FollowupFacts, Viewer } from "@/domains/suivis/policies";

import { FOLLOWUP_SITUATIONS, defaultAccess } from "./matrix";
import { formattedPermissionsMarkdown } from "./matrix-doc";
import { PERMISSION_KEYS, ROLE_PERMISSIONS } from "./permissions";
import type { PermissionKey } from "./permissions";

const viewer = (...permissions: PermissionKey[]): Viewer => ({
  membershipId: "moi",
  permissions: new Set(permissions),
});
const followup = (facts: Partial<FollowupFacts> = {}): FollowupFacts => ({
  responsibleMembershipId: "confrere",
  isPrivate: false,
  sharedWith: [],
  ...facts,
});

describe("matrice des permissions", () => {
  it("docs/securite/permissions.md est à jour (pnpm docs:permissions)", async () => {
    expect(await readFile("docs/securite/permissions.md", "utf8")).toBe(
      await formattedPermissionsMarkdown(),
    );
  });

  it("chaque rôle n'a que des permissions du catalogue, sans doublon", () => {
    for (const grants of Object.values(ROLE_PERMISSIONS)) {
      const all = [...grants.defaults, ...grants.optional];
      expect(new Set(all).size).toBe(all.length);
      for (const key of all) expect(PERMISSION_KEYS).toContain(key);
    }
  });

  it("seul l'administrateur gère l'équipe, les réglages, la facturation et le journal", () => {
    for (const key of [
      "team.manage",
      "organization.settings",
      "billing.manage",
      "activity_log.read",
    ] as const) {
      expect(ROLE_PERMISSIONS.vet.defaults).not.toContain(key);
      expect(ROLE_PERMISSIONS.vet.optional).not.toContain(key);
      expect(ROLE_PERMISSIONS.assistant.defaults).not.toContain(key);
      expect(ROLE_PERMISSIONS.assistant.optional).not.toContain(key);
    }
  });

  it("un assistant n'a par défaut ni données cliniques ni réponse au propriétaire", () => {
    expect(ROLE_PERMISSIONS.assistant.defaults).not.toContain("clinical.read");
    expect(ROLE_PERMISSIONS.assistant.defaults).not.toContain(
      "owner_messages.reply",
    );
  });

  it.each(FOLLOWUP_SITUATIONS)(
    "situation « $label » : cas par cas",
    (situation) => {
      const admin = defaultAccess("admin_vet", situation);
      const vet = defaultAccess("vet", situation);
      const assistant = defaultAccess("assistant", situation);
      const involved = situation.responsible || situation.shared;

      // Un dossier privé n'est visible que de son responsable et des partages explicites.
      if (situation.isPrivate && !involved) {
        expect([admin, vet, assistant]).toEqual(["none", "none", "none"]);
        return;
      }
      expect(admin).toBe("clinical");
      expect(vet).toBe(involved ? "clinical" : "none");
      expect(assistant).toBe(involved ? "not_applicable" : "summary");
    },
  );
});

describe("accès à un dossier", () => {
  it("ne donne rien sans permission de lecture, même au responsable", () => {
    expect(
      followupAccess(viewer(), followup({ responsibleMembershipId: "moi" })),
    ).toBe("none");
  });

  it("un partage expiré ou révoqué ne figure plus dans sharedWith : plus d'accès", () => {
    expect(
      followupAccess(viewer("followups.read_own", "clinical.read"), followup()),
    ).toBe("none");
  });

  it("un assistant à qui l'on ouvre clinical.read voit le détail des dossiers non privés", () => {
    const assistant = viewer("followups.read_summary", "clinical.read");
    expect(followupAccess(assistant, followup())).toBe("clinical");
    expect(followupAccess(assistant, followup({ isPrivate: true }))).toBe(
      "none",
    );
  });

  it("un vétérinaire à qui l'on ouvre read_all voit les suivis non privés des confrères", () => {
    const vet = viewer(
      "followups.read_own",
      "followups.read_all",
      "clinical.read",
    );
    expect(followupAccess(vet, followup())).toBe("clinical");
    expect(followupAccess(vet, followup({ isPrivate: true }))).toBe("none");
  });
});
