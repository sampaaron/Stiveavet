import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SEED } from "../../db/seed/cabinets-fictifs";
import { fakeAiGateway } from "@/adapters/ai-gateway/fake";
import type { AiGateway } from "@/adapters/ai-gateway/types";
import { createFakeDrVeto } from "@/adapters/drveto/fake";
import { DomainError } from "@/domains/equipe/actor";
import type { Actor } from "@/domains/equipe/actor";
import { ROLE_PERMISSIONS } from "@/domains/equipe/permissions";
import { followupsService } from "@/domains/suivis/service";
import { synthesisService } from "@/domains/suivis/synthese";
import { todayService } from "@/domains/suivis/tableau";
import { followups as fixtureFollowups } from "@/fixtures/cabinet-tilleuls";

import { pools } from "./support/db";

/**
 * Lot 17 (ADR 0020) : le tableau de bord « Aujourd'hui » et la synthèse pré-consultation
 * lisent la base. Livrable du plan : synthèses jamais servies à un assistant non autorisé.
 */

const { app, admin, appDb } = pools();
afterAll(async () => {
  await app.end();
  await admin.end();
});

const suivis = followupsService(appDb);
const today = todayService({
  db: appDb,
  followups: suivis,
  drveto: createFakeDrVeto(),
});
const syntheses = synthesisService({ db: appDb, ai: fakeAiGateway });

const idOf = (name: string) => {
  const found = fixtureFollowups.find((entry) => entry.animal.name === name);
  if (!found) throw new Error(name);
  return found.id;
};
const caramel = idOf("Caramel");
const moka = idOf("Moka");
const pixel = idOf("Pixel");

async function actor(email: string): Promise<Actor> {
  const { rows } = await admin.query(
    `SELECT m.id, m.user_id, m.role, m.organization_id FROM memberships m
     JOIN users u ON u.id = m.user_id WHERE u.email = $1`,
    [email],
  );
  const row = rows[0] as
    | {
        id: string;
        user_id: string;
        role: Actor["role"];
        organization_id: string;
      }
    | undefined;
  if (!row) throw new Error(`Membre fictif introuvable : ${email}`);
  return {
    organizationId: row.organization_id,
    userId: row.user_id,
    membershipId: row.id,
    role: row.role,
    permissions: new Set(ROLE_PERMISSIONS[row.role].defaults),
  };
}

async function refusal(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
}

let claire: Actor;
let hugo: Actor;
let lea: Actor;
let paul: Actor;
beforeAll(async () => {
  claire = await actor("claire.fontaine@tilleuls.test");
  hugo = await actor("hugo.marchal@tilleuls.test");
  lea = await actor("lea.roux@tilleuls.test");
  paul = await actor("paul.martin@cabinet-martin.test");
});

describe("tableau de bord « Aujourd'hui »", () => {
  it("l'administratrice voit l'urgence en premier, avec la raison du triage", async () => {
    const view = await today.today(claire);
    const [first] = view.followups;
    expect(first?.id).toBe(caramel);
    expect(first?.summary).toMatchObject({
      kind: "alert",
      reason: "Signal d'urgence reconnu dans le message du propriétaire.",
      owner: {
        text: "Elle se lèche beaucoup et le pansement est rouge, je suis inquiet.",
        media: "voice",
      },
    });
    const byName = new Map(
      view.followups.map((entry) => [entry.animalName, entry]),
    );
    expect(byName.get("Moka")?.triage).toBe("watch");
    expect(byName.get("Oscar")?.summary).toEqual({ kind: "paused" });
    expect(byName.get("Filou")?.summary).toEqual({ kind: "human_takeover" });
    expect(byName.get("Nala")?.summary).toEqual({ kind: "consent_requested" });
    expect(byName.get("Ruby")?.summary).toEqual({ kind: "quiet" });
    expect(byName.get("Nala")?.consent).toBe("requested");
    expect(byName.get("Caramel")?.consent).toBe("given");
    // Rien d'un autre cabinet.
    expect(byName.has("Sushi")).toBe(false);
  });

  it("dernière nouvelle du propriétaire : son texte, ou la transcription d'un vocal", async () => {
    // Moka : alerte « à surveiller » vue ; sans elle, la dernière nouvelle serait affichée.
    const { rows } = await admin.query(
      `SELECT body FROM messages WHERE followup_id = $1 AND author = 'owner'
       ORDER BY occurred_at DESC LIMIT 1`,
      [moka],
    );
    expect((rows[0] as { body: string }).body).toBe(
      "Un peu, mais moins que d'habitude.",
    );
    const view = await today.today(claire);
    const entry = view.followups.find((row) => row.id === moka);
    expect(entry?.lastActivityAt).toBeInstanceOf(Date);
  });

  it("compteur de capacité : total du cabinet ; agenda : dr.veto simulé et rendez-vous Stivea", async () => {
    const view = await today.today(claire);
    expect(view.activeFollowups).toBeGreaterThanOrEqual(7);
    expect(view.includedFollowups).toBe(10);
    const agenda = view.agenda ?? [];
    const control = agenda.find(
      (item) =>
        "appointment" in item.title &&
        item.title.appointment === "post_op_control" &&
        item.title.animalName === "Moka",
    );
    expect(control).toMatchObject({
      fromStivea: true,
      kind: "controle",
      followupId: moka,
      vetName: "Dr Claire Fontaine",
    });
    expect(
      agenda.find(
        (item) => "text" in item.title && item.title.text.includes("Gaïa"),
      ),
    ).toMatchObject({
      fromStivea: false,
      kind: "consultation",
      followupId: null,
    });
    expect(view.stiveaAppointments).toBeGreaterThanOrEqual(1);
    const times = agenda.map((item) => item.startsAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("un vétérinaire ne voit que ses suivis ; le lien d'un rendez-vous ne mène qu'à un dossier permis", async () => {
    const view = await today.today(hugo);
    expect(view.followups.map((row) => row.animalName).sort()).toEqual([
      "Filou",
      "Nala",
    ]);
    const control = view.agenda?.find(
      (item) =>
        "appointment" in item.title &&
        item.title.appointment === "post_op_control" &&
        item.title.animalName === "Moka",
    );
    expect(control?.followupId).toBeNull();
    // Le compteur reste le total du cabinet, sans détail.
    expect(view.activeFollowups).toBeGreaterThanOrEqual(7);
  });

  it("une assistante sans accès clinique : aucun détail clinique, l'agenda seulement", async () => {
    const view = await today.today(lea);
    expect(view.followups).toEqual([]);
    expect(view.views.every((entry) => entry.access === "summary")).toBe(true);
    expect(view.views.length).toBeGreaterThanOrEqual(7);
    expect(JSON.stringify(view.views)).not.toMatch(/triage|procedure/);
    expect(view.agenda).not.toBeNull();
  });

  it("un autre cabinet ne voit que ses suivis, sans agenda dr.veto s'il n'est pas connecté", async () => {
    const view = await today.today(paul);
    expect(view.followups.map((row) => row.animalName)).toEqual(["Sushi"]);
    expect(
      view.agenda?.some(
        (item) => "text" in item.title && item.title.text.includes("Gaïa"),
      ),
    ).toBe(false);
  });
});

describe("synthèse pré-consultation", () => {
  it("à l'ouverture : échanges comptés, propos cités mot pour mot, alertes de la base", async () => {
    const synthesis = await syntheses.forFollowup(claire, caramel);
    expect(synthesis?.exchanges).toEqual({
      ownerMessages: 5,
      photos: 1,
      voiceNotes: 1,
    });
    expect(synthesis?.negatives).toEqual([
      "« Il y a du sang sur la plaie depuis ce soir. » (photo)",
      "« Elle se lèche beaucoup et le pansement est rouge, je suis inquiet. » (vocal)",
    ]);
    expect(synthesis?.positives).toEqual([
      "« Elle est un peu groggy mais elle marche. Elle a bu un peu d'eau. »",
      "« Bonne nuit, elle a mangé la moitié de sa ration. »",
    ]);
    expect(synthesis?.evolution).toMatch(/^Jour 1 du suivi \(Ovariectomie\)\./);
    expect(synthesis?.alerts[0]).toMatchObject({
      level: "urgent",
      reason: "Signal d'urgence reconnu dans le message du propriétaire.",
    });
    expect(synthesis?.withheld).toBe(0);
    expect(synthesis?.simulated).toBe(true);
  });

  it("gardée en base, refaite seulement si les échanges changent ; journalisée sans contenu", async () => {
    const first = await syntheses.forFollowup(claire, moka);
    const again = await syntheses.forFollowup(claire, moka);
    expect(again?.generatedAt.getTime()).toBe(first?.generatedAt.getTime());

    const { rows: triage } = await admin.query(
      "SELECT id FROM triage_events WHERE followup_id = $1 LIMIT 1",
      [moka],
    );
    await admin.query(
      `INSERT INTO triage_events (organization_id, followup_id, level, source, reason, created_by_membership_id)
       VALUES ($1, $2, 'normal', 'vet', 'Revu par la vétérinaire', $3)`,
      [SEED.tilleuls, moka, claire.membershipId],
    );
    expect(triage.length).toBeGreaterThan(0);
    const refreshed = await syntheses.forFollowup(claire, moka);
    expect(refreshed?.generatedAt.getTime()).toBeGreaterThan(
      first?.generatedAt.getTime() ?? 0,
    );

    const { rows } = await admin.query(
      `SELECT metadata FROM audit_events
       WHERE action = 'synthesis.generated' AND target_id = $1`,
      [moka],
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      metadata: { engine: "simulated", withheld: 0, reasons: [] },
    });
  });

  it("jamais pour une assistante, un vétérinaire sans accès ou un autre cabinet", async () => {
    expect(await refusal(syntheses.forFollowup(lea, caramel))).toBe(
      "not_found",
    );
    expect(await refusal(syntheses.forFollowup(hugo, caramel))).toBe(
      "not_found",
    );
    expect(await refusal(syntheses.forFollowup(paul, caramel))).toBe(
      "not_found",
    );
    expect(await refusal(syntheses.forFollowup(claire, "pas-un-id"))).toBe(
      "not_found",
    );
    // Seul un droit clinique ouvert explicitement par l'administrateur lui donne la synthèse.
    const opened: Actor = {
      ...lea,
      permissions: new Set([...lea.permissions, "clinical.read"]),
    };
    const granted = await syntheses.forFollowup(opened, caramel);
    expect(granted?.exchanges.ownerMessages).toBe(5);
  });

  it("une rédaction hors cadre est écartée par les garde-fous, sans rien garder de son contenu", async () => {
    const hostile: AiGateway = {
      ...fakeAiGateway,
      async summarizeFollowup() {
        return {
          evolution: "Il s'agit d'une infection : rien de grave.",
          positives: ["« Pixel bave un peu ce matin. »"],
          negatives: ["« Pixel a une infection dentaire »"],
          openQuestions: ["Donnez-lui 2 comprimés ce soir."],
        };
      },
    };
    const synthesis = await synthesisService({
      db: appDb,
      ai: hostile,
    }).forFollowup(claire, pixel);
    expect(synthesis).toMatchObject({
      evolution:
        "Synthèse indisponible pour cette partie : lisez la conversation.",
      positives: ["« Pixel bave un peu ce matin. »"],
      negatives: [],
      openQuestions: [],
      withheld: 3,
    });
    const { rows } = await admin.query(
      `SELECT metadata FROM audit_events
       WHERE action = 'synthesis.generated' AND target_id = $1`,
      [pixel],
    );
    expect(rows.at(-1)).toEqual({
      metadata: {
        engine: "simulated",
        withheld: 3,
        reasons: ["diagnosis", "unfaithful_quote", "dosage"],
      },
    });
    expect(JSON.stringify(rows)).not.toContain("infection");
  });
});
