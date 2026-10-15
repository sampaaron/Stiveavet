import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createOrganization } from "../../db/seed/cabinets-fictifs";
import { fakeDrVeto } from "@/adapters/drveto/fake";
import { fakePaymentMandate } from "@/adapters/payments/fake";
import { DomainError } from "@/domains/equipe/actor";
import type { Actor } from "@/domains/equipe/actor";
import { isPermissionKey } from "@/domains/equipe/permissions";
import { protocolsService } from "@/domains/protocoles/service";
import { DEFAULT_MESSAGE_WINDOWS } from "@/domains/reglages/content";
import { settingsService } from "@/domains/reglages/service";

import { asApp, errorCode, pools } from "./support/db";

const { app, admin, appDb } = pools();
afterAll(async () => {
  await app.end();
  await admin.end();
});

const service = settingsService({
  db: appDb,
  whatsapp: { live: false },
  drveto: fakeDrVeto,
  payments: fakePaymentMandate,
});
const protocols = protocolsService(appDb);

// Cabinet neuf, propre à ce fichier : l'installation part de zéro.
const org = randomUUID();
const tag = org.slice(0, 8);
let ids: { admin: string; vet: string; assistant: string };

beforeAll(async () => {
  const [adminId, vet, assistant] = await createOrganization(
    appDb,
    org,
    "Clinique d'essai de l'installation",
    [
      {
        email: `ra-${tag}@essai.test`,
        displayName: "Dr Rita Admin",
        role: "admin_vet",
      },
      {
        email: `rv-${tag}@essai.test`,
        displayName: "Dr Rémi Vet",
        role: "vet",
      },
      {
        email: `ras-${tag}@essai.test`,
        displayName: "Rose Asv",
        role: "assistant",
      },
    ],
  );
  if (!adminId || !vet || !assistant) throw new Error("cabinet");
  ids = { admin: adminId, vet, assistant };
});

async function actor(membershipId: string): Promise<Actor> {
  const { rows } = await admin.query(
    `SELECT m.user_id, m.role, array_remove(array_agg(p.permission), NULL) AS permissions
     FROM memberships m LEFT JOIN membership_permissions p ON p.membership_id = m.id
     WHERE m.id = $1 GROUP BY m.id`,
    [membershipId],
  );
  const row = rows[0] as
    { user_id: string; role: Actor["role"]; permissions: string[] } | undefined;
  if (!row) throw new Error("membre inconnu");
  return {
    organizationId: org,
    userId: row.user_id,
    membershipId,
    role: row.role,
    permissions: new Set(row.permissions.filter(isPermissionKey)),
  };
}

async function domainError(promise: Promise<unknown>) {
  try {
    await promise;
    return undefined;
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
}

async function auditActions(): Promise<
  { action: string; metadata: Record<string, unknown> }[]
> {
  const { rows } = await admin.query(
    `SELECT action, metadata FROM audit_events WHERE organization_id = $1 ORDER BY occurred_at`,
    [org],
  );
  return rows as { action: string; metadata: Record<string, unknown> }[];
}

const hours = (n: number) => new Date(Date.now() + n * 3_600_000);

describe("installation guidée d'un cabinet neuf", () => {
  it("part de zéro : seul le cabinet est prêt, l'analyse photo est désactivée", async () => {
    const rita = await actor(ids.admin);
    const onboarding = await service.onboarding(rita);
    expect(onboarding.completed).toBe(1);
    expect(onboarding.steps.organization).toBe(true);
    expect(onboarding.steps.rules).toBe(false);

    const settings = await service.get(rita);
    expect(settings.photoAnalysisEnabled).toBe(false);
    expect(settings.escalationDelayMinutes).toBe(240);
    expect(settings.integrations).toEqual({});
  });

  it("les réglages par défaut et un contact d'urgence complètent les règles", async () => {
    const rita = await actor(ids.admin);
    await service.applyDefaults(rita);
    // Appliquer deux fois ne duplique rien.
    await service.applyDefaults(rita);
    const settings = await service.get(rita);
    expect(settings.messageWindows).toEqual(DEFAULT_MESSAGE_WINDOWS);
    expect(Object.keys(settings.instructions).sort()).toEqual([
      "day",
      "holiday",
      "night",
      "weekend",
    ]);
    expect((await service.onboarding(rita)).steps.rules).toBe(false);

    await service.addContact(rita, {
      label: "Accueil du cabinet",
      phone: "01 23 45 67 89",
    });
    expect((await service.onboarding(rita)).steps.rules).toBe(true);
  });

  it("les connexions sont simulées et ne gardent qu'un libellé masqué", async () => {
    const rita = await actor(ids.admin);
    await service.connect(rita, "whatsapp", "06 12 34 56 78");
    await service.connect(rita, "drveto", "CAB-1234");
    await service.connect(rita, "payment_mandate", "");

    const { integrations } = await service.get(rita);
    expect(integrations.whatsapp?.displayLabel).toBe("•• •• •• •• 78 (simulé)");
    expect(integrations.drveto?.displayLabel).toContain("(simulé)");
    expect(integrations.payment_mandate?.displayLabel).toContain("simulé");

    const { rows } = await admin.query(
      `SELECT mode, display_label FROM integration_connections WHERE organization_id = $1`,
      [org],
    );
    for (const row of rows as { mode: string; display_label: string }[]) {
      expect(row.mode).toBe("simulated");
      expect(row.display_label).not.toContain("12 34 56");
      expect(row.display_label).not.toContain("1234");
    }
    expect(
      await domainError(service.connect(rita, "whatsapp", "pas un numéro")),
    ).toBe("invalid_target");
  });

  it("le suivi test exige un protocole validé, reste en brouillon et marqué comme test", async () => {
    const rita = await actor(ids.admin);
    const protocolId = await protocols.installFromLibrary(rita, "detartrage");
    expect(
      await domainError(service.createTestFollowup(rita, protocolId)),
    ).toBe("invalid_target");
    expect((await service.onboarding(rita)).steps.protocols).toBe(false);

    await protocols.validate(rita, protocolId);
    await service.completeStep(rita, "team");
    const followupId = await service.createTestFollowup(rita, protocolId);

    const { rows } = await admin.query(
      `SELECT status, is_test FROM followups WHERE id = $1`,
      [followupId],
    );
    expect(rows[0]).toEqual({ status: "draft", is_test: true });

    const onboarding = await service.onboarding(rita);
    expect(onboarding.completed).toBe(8);
    expect(Object.values(onboarding.steps).every(Boolean)).toBe(true);
  });

  it("le journal trace chaque étape sans numéro de téléphone", async () => {
    const events = await auditActions();
    const actions = events.map((event) => event.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        "settings.defaults_applied",
        "settings.emergency_contact_added",
        "integration.connected",
        "onboarding.step_completed",
        "followup.test_created",
      ]),
    );
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain("01 23 45");
    expect(serialized).not.toContain("06 12 34");
  });
});

describe("réglages de Numa", () => {
  it("le délai d'escalade reste entre 3 et 5 heures", async () => {
    const rita = await actor(ids.admin);
    await service.saveAlertSettings(rita, {
      escalationDelayMinutes: 180,
      photoAnalysisEnabled: true,
    });
    expect((await service.get(rita)).escalationDelayMinutes).toBe(180);
    expect(
      await domainError(
        service.saveAlertSettings(rita, {
          escalationDelayMinutes: 120,
          photoAnalysisEnabled: false,
        }),
      ),
    ).toBe("invalid_target");

    // La base refuse aussi une valeur hors bornes.
    const code = await errorCode(
      asApp(app, org, (client) =>
        client.query(
          `UPDATE organization_settings SET escalation_delay_minutes = 400`,
        ),
      ),
    );
    expect(code).toBe("23514");
  });

  it("une seule plage d'envoi par jour, fin après début", async () => {
    const rita = await actor(ids.admin);
    expect(
      await domainError(
        service.saveMessageWindows(rita, [
          { weekday: 1, startsAt: "08:00", endsAt: "12:00" },
          { weekday: 1, startsAt: "14:00", endsAt: "18:00" },
        ]),
      ),
    ).toBe("invalid_target");
    expect(
      await domainError(
        service.saveMessageWindows(rita, [
          { weekday: 2, startsAt: "18:00", endsAt: "08:00" },
        ]),
      ),
    ).toBe("invalid_target");
    await service.saveMessageWindows(rita, [
      { weekday: 1, startsAt: "09:00", endsAt: "19:00" },
    ]);
    expect((await service.get(rita)).messageWindows).toEqual([
      { weekday: 1, startsAt: "09:00", endsAt: "19:00" },
    ]);
  });

  it("les consignes d'urgence sont propres à chaque période", async () => {
    const rita = await actor(ids.admin);
    await service.saveInstructions(
      rita,
      "night",
      "La nuit, appelez la clinique de garde partenaire.",
    );
    const { instructions } = await service.get(rita);
    expect(instructions.night).toBe(
      "La nuit, appelez la clinique de garde partenaire.",
    );
    expect(instructions.day).not.toBe(instructions.night);
    expect(
      await domainError(service.saveInstructions(rita, "night", "court")),
    ).toBe("invalid_target");
  });

  it("un assistant ou un vétérinaire sans réglages ne voit ni ne modifie rien", async () => {
    for (const membershipId of [ids.assistant, ids.vet]) {
      const member = await actor(membershipId);
      expect(member.permissions.has("organization.settings")).toBe(false);
      expect(await domainError(service.get(member))).toBe("not_found");
      expect(
        await domainError(
          service.saveAlertSettings(member, {
            escalationDelayMinutes: 300,
            photoAnalysisEnabled: true,
          }),
        ),
      ).toBe("not_found");
      expect(await domainError(service.connect(member, "drveto", "ABC"))).toBe(
        "not_found",
      );
    }
  });
});

describe("planning de garde", () => {
  it("un vétérinaire actif, sans chevauchement, au plus 14 jours", async () => {
    const rita = await actor(ids.admin);
    await service.addOnCall(rita, {
      membershipId: ids.vet,
      startsAt: hours(1),
      endsAt: hours(13),
    });
    expect(
      await domainError(
        service.addOnCall(rita, {
          membershipId: ids.admin,
          startsAt: hours(12),
          endsAt: hours(20),
        }),
      ),
    ).toBe("on_call_overlap");
    expect(
      await domainError(
        service.addOnCall(rita, {
          membershipId: ids.assistant,
          startsAt: hours(30),
          endsAt: hours(40),
        }),
      ),
    ).toBe("invalid_target");
    expect(
      await domainError(
        service.addOnCall(rita, {
          membershipId: ids.vet,
          startsAt: hours(50),
          endsAt: hours(50 + 15 * 24),
        }),
      ),
    ).toBe("invalid_target");

    const { onCall, onCallCandidates } = await service.get(rita);
    expect(onCall).toHaveLength(1);
    expect(onCall[0]?.name).toBe("Dr Rémi Vet");
    // Seuls les vétérinaires actifs peuvent être de garde.
    expect(onCallCandidates.map((c) => c.name).sort()).toEqual(
      ["Dr Rita Admin", "Dr Rémi Vet"].sort(),
    );

    const id = onCall[0]?.id ?? "";
    await service.removeOnCall(rita, id);
    expect((await service.get(rita)).onCall).toEqual([]);
  });

  it("la base refuse une garde confiée à un assistant", async () => {
    const code = await errorCode(
      asApp(app, org, (client) =>
        client.query(
          `INSERT INTO on_call_schedules (organization_id, membership_id, starts_at, ends_at, created_by_membership_id)
           VALUES ($1, $2, now(), now() + interval '1 hour', $3)`,
          [org, ids.assistant, ids.admin],
        ),
      ),
    );
    expect(code).toBe("23514");
  });

  it("la base refuse une connexion réelle à dr.veto (WhatsApp et prélèvement seulement)", async () => {
    for (const provider of ["drveto"])
      expect(
        await errorCode(
          asApp(app, org, (client) =>
            client.query(
              `INSERT INTO integration_connections (organization_id, provider, mode, display_label, connected_by_membership_id)
               VALUES ($1, $2, 'live', 'Compte réel', $3)
               ON CONFLICT DO NOTHING`,
              [org, provider, ids.admin],
            ),
          ),
        ),
      ).toBe("23514");
  });
});
