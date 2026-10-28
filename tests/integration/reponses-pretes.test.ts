import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { fakeAiGateway } from "@/adapters/ai-gateway/fake";
import { createFakeDrVeto } from "@/adapters/drveto/fake";
import { DomainError } from "@/domains/commun/actor";
import type { Actor } from "@/domains/commun/actor";
import { ROLE_PERMISSIONS } from "@/domains/equipe/permissions";
import {
  MAX_TEMPLATES,
  replyTemplatesService,
} from "@/domains/reponses/service";
import { followupsService } from "@/domains/suivis/service";
import { synthesisService } from "@/domains/suivis/synthese";
import { todayService } from "@/domains/suivis/tableau";
import { followups as fixtureFollowups } from "@/fixtures/cabinet-tilleuls";

import { pools } from "./support/db";

/**
 * Étape 3 du plan « Faire gagner du temps au vétérinaire » (ADR 0048) : modèles de réponse
 * du cabinet, copie de la synthèse pour dr.veto, réponses attendues dans « À traiter ».
 */

const { app, admin, appDb } = pools();
afterAll(async () => {
  await app.end();
  await admin.end();
});

const templates = replyTemplatesService(appDb);
const syntheses = synthesisService({ db: appDb, ai: fakeAiGateway });
const today = todayService({
  db: appDb,
  followups: followupsService(appDb),
  drveto: createFakeDrVeto(),
});

const idOf = (name: string) => {
  const found = fixtureFollowups.find((entry) => entry.animal.name === name);
  if (!found) throw new Error(name);
  return found.id;
};

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

describe("modèles de réponse du cabinet", () => {
  it("l'administratrice les écrit ; qui répond aux propriétaires les lit", async () => {
    const id = await templates.create(claire, {
      title: "Essai d'intégration",
      body: "Bonjour {proprietaire}, nous avons bien reçu votre message au sujet de {animal}.",
      language: "fr",
    });
    const forHugo = await templates.list(hugo);
    expect(forHugo.find((template) => template.id === id)).toMatchObject({
      title: "Essai d'intégration",
      language: "fr",
      createdBy: "Dr Claire Fontaine",
    });
    // Le vétérinaire lit, mais n'écrit pas les modèles du cabinet.
    expect(
      await refusal(
        templates.create(hugo, { title: "x", body: "y", language: "fr" }),
      ),
    ).toBe("not_found");
    expect(
      await refusal(
        templates.update(hugo, id, { title: "x", body: "y", language: "fr" }),
      ),
    ).toBe("not_found");
    expect(await refusal(templates.remove(hugo, id))).toBe("not_found");

    await templates.update(claire, id, {
      title: "Essai modifié",
      body: "Texte modifié.",
      language: "en",
    });
    const { rows } = await admin.query(
      `SELECT action, metadata FROM audit_events WHERE target_id = $1 ORDER BY occurred_at, action`,
      [id],
    );
    expect(rows).toEqual([
      { action: "reply_template.created", metadata: { language: "fr" } },
      { action: "reply_template.updated", metadata: { language: "en" } },
    ]);
    // Le journal ne garde jamais le texte du modèle.
    expect(JSON.stringify(rows)).not.toMatch(/Bonjour|modifié/);
    await templates.remove(claire, id);
    expect((await templates.list(claire)).map((t) => t.id)).not.toContain(id);
  });

  it("une assistante sans droit de réponse ne les voit pas ; un autre cabinet non plus", async () => {
    expect(await refusal(templates.list(lea))).toBe("not_found");
    const ids = new Set((await templates.list(claire)).map((t) => t.id));
    expect(ids.size).toBeGreaterThan(0);
    const other = await templates.list(paul);
    expect(other.some((template) => ids.has(template.id))).toBe(false);
    const [first] = ids;
    if (!first) throw new Error("modèle fictif");
    expect(await refusal(templates.remove(paul, first))).toBe("not_found");
    expect(
      await refusal(
        templates.update(paul, first, {
          title: "x",
          body: "y",
          language: "fr",
        }),
      ),
    ).toBe("not_found");
  });

  it("refuse un modèle mal formé et plafonne leur nombre", async () => {
    for (const input of [
      { title: "", body: "Texte", language: "fr" },
      { title: "Titre", body: "", language: "fr" },
      { title: "Titre", body: "x".repeat(1001), language: "fr" },
      { title: "Titre", body: "Texte", language: "de" },
    ])
      expect(await refusal(templates.create(paul, input))).toBe(
        "invalid_target",
      );
    const existing = (await templates.list(paul)).length;
    for (let index = existing; index < MAX_TEMPLATES; index += 1)
      await templates.create(paul, {
        title: `Modèle ${index}`,
        body: "Texte d'essai.",
        language: "fr",
      });
    expect(
      await refusal(
        templates.create(paul, {
          title: "Un de trop",
          body: "x",
          language: "fr",
        }),
      ),
    ).toBe("template_limit");
  });
});

describe("copie de la synthèse pour dr.veto", () => {
  it("notée au journal sans contenu ; refusée sans accès clinique", async () => {
    const caramel = idOf("Caramel");
    await syntheses.recordCopy(claire, caramel);
    const { rows } = await admin.query(
      `SELECT metadata FROM audit_events WHERE target_id = $1 AND action = 'synthesis.copied'
       ORDER BY occurred_at DESC LIMIT 1`,
      [caramel],
    );
    expect(rows[0]).toEqual({ metadata: { target: "drveto" } });
    // Assistante sans accès clinique, vétérinaire hors du dossier, autre cabinet.
    expect(await refusal(syntheses.recordCopy(lea, caramel))).toBe("not_found");
    expect(await refusal(syntheses.recordCopy(hugo, caramel))).toBe(
      "not_found",
    );
    expect(await refusal(syntheses.recordCopy(paul, caramel))).toBe(
      "not_found",
    );
  });
});

describe("réponses attendues", () => {
  it("seulement quand Numa ne répond plus et que le propriétaire a écrit en dernier", async () => {
    const view = await today.today(claire);
    const { rows } = await admin.query(
      `SELECT DISTINCT ON (followup_id) followup_id, author FROM messages
       WHERE followup_id = ANY($1) ORDER BY followup_id, occurred_at DESC, id DESC`,
      [view.followups.map((row) => row.id)],
    );
    const lastAuthor = new Map(
      (rows as { followup_id: string; author: string }[]).map((row) => [
        row.followup_id,
        row.author,
      ]),
    );
    for (const row of view.followups)
      expect(row.awaitingReply).toBe(
        (row.status === "paused" || row.status === "human_takeover") &&
          lastAuthor.get(row.id) === "owner",
      );
    expect(
      view.followups.find((row) => row.animalName === "Ruby")?.awaitingReply,
    ).toBe(false);
  });

  it("donne la date de contrôle de la fiche", async () => {
    const view = await today.today(claire);
    const { rows } = await admin.query(
      "SELECT id, control_appointment_at FROM followups WHERE id = ANY($1)",
      [view.followups.map((row) => row.id)],
    );
    for (const row of rows as {
      id: string;
      control_appointment_at: Date | null;
    }[])
      expect(
        view.followups.find((entry) => entry.id === row.id)
          ?.controlAppointmentAt ?? null,
      ).toEqual(row.control_appointment_at);
  });
});
