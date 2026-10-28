import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SEED } from "../../db/seed/cabinets-fictifs";
import { fakeAiGateway } from "@/adapters/ai-gateway/fake";
import { createFakeDrVeto } from "@/adapters/drveto/fake";
import { createMemoryStorage } from "@/adapters/object-storage/memory";
import { agendaService } from "@/domains/agenda/captures";
import { appointmentsService, findSlots } from "@/domains/agenda/demandes";
import { conversationsService } from "@/domains/conversations/service";
import { DomainError } from "@/domains/equipe/actor";
import type { Actor } from "@/domains/equipe/actor";
import { ROLE_PERMISSIONS } from "@/domains/equipe/permissions";
import type { PermissionKey } from "@/domains/equipe/permissions";
import { parisMonth, stiveService } from "@/domains/stive/service";
import type { StiveAnswer } from "@/domains/stive/reponses";
import { launchService } from "@/domains/suivis/lancement";
import { followupsService } from "@/domains/suivis/service";
import { synthesisService } from "@/domains/suivis/synthese";
import { todayService } from "@/domains/suivis/tableau";
import { alertsService } from "@/domains/urgences/service";
import { followups as fixtureFollowups } from "@/fixtures/cabinet-tilleuls";
import {
  appointments as appointmentRows,
  followups,
  messages,
} from "@/server/db/schema";
import { withTenant } from "@/server/db/tenant";

import { pools } from "./support/db";

/**
 * Stive, lot 29 (ADR 0034), sur les dossiers fictifs : il ne lit que ce que la personne peut
 * voir, n'agit jamais sans confirmation, respecte la limite du mois et l'offre, et ses
 * échanges restent à leur auteur avant d'être effacés à 30 jours.
 */

const { app, admin, appDb } = pools();
afterAll(async () => {
  await app.end();
  await admin.end();
});

const drveto = createFakeDrVeto();
const suivis = followupsService(appDb);
const launch = launchService({ db: appDb, drveto });
const appointments = appointmentsService(appDb);
const stive = stiveService({
  db: appDb,
  followups: suivis,
  today: todayService({ db: appDb, followups: suivis, drveto }),
  synthesis: synthesisService({ db: appDb, ai: fakeAiGateway }),
  appointments,
  agenda: agendaService({
    db: appDb,
    storage: createMemoryStorage(),
    ai: fakeAiGateway,
  }),
  conversations: conversationsService(appDb),
  launch,
  alerts: alertsService(appDb),
});

const idOf = (name: string) => {
  const found = fixtureFollowups.find((entry) => entry.animal.name === name);
  if (!found) throw new Error(name);
  return found.id;
};

async function actor(
  email: string,
  permissions?: PermissionKey[],
): Promise<Actor> {
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
    permissions: new Set(permissions ?? ROLE_PERMISSIONS[row.role].defaults),
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

function expectKind<K extends StiveAnswer["kind"]>(
  answer: StiveAnswer,
  kind: K,
): Extract<StiveAnswer, { kind: K }> {
  expect(answer.kind).toBe(kind);
  return answer as Extract<StiveAnswer, { kind: K }>;
}

async function auditCount(action: string, targetId: string) {
  const { rows } = await admin.query(
    "SELECT count(*)::int AS n FROM audit_events WHERE action = $1 AND target_id = $2",
    [action, targetId],
  );
  return (rows[0] as { n: number }).n;
}

let claire: Actor;
let hugo: Actor;
let lea: Actor;
let paul: Actor;
beforeAll(async () => {
  claire = await actor("claire.fontaine@tilleuls.test");
  hugo = await actor("hugo.marchal@tilleuls.test");
  lea = await actor("lea.roux@tilleuls.test", [
    ...ROLE_PERMISSIONS.assistant.defaults,
    "stive.use",
  ]);
  paul = await actor("paul.martin@cabinet-martin.test");
});

describe("Stive : ce qu'il lit", () => {
  it("le point du jour d'une vétérinaire administratrice : urgences, agenda, alertes", async () => {
    const briefing = expectKind(
      await stive.ask(claire, { question: "Mon point du jour" }),
      "briefing",
    );
    expect(briefing.urgent.map((line) => line.animalName)).toContain("Caramel");
    expect(briefing.watch.map((line) => line.animalName)).toContain("Moka");
    expect(briefing.unacknowledged).not.toBeNull();
    expect(briefing.agenda).not.toBeNull();
  });

  it("le résumé d'un dossier : synthèse et consultation tracée, sans la question", async () => {
    const caramel = idOf("Caramel");
    const before = await auditCount("followup.viewed", caramel);
    const summary = expectKind(
      await stive.ask(
        claire,
        { question: "Résumé du dossier de Caramel" },
        { locale: "fr" },
      ),
      "summary",
    );
    expect(summary.followup.id).toBe(caramel);
    expect(summary.synthesis?.evolution).toBeTruthy();
    expect(await auditCount("followup.viewed", caramel)).toBe(before + 1);
    const { rows } = await admin.query(
      "SELECT metadata FROM audit_events WHERE action = 'followup.viewed' AND target_id = $1 ORDER BY occurred_at DESC LIMIT 1",
      [caramel],
    );
    expect(rows[0]).toEqual({
      metadata: { access: "clinical", via: "stive" },
    });
  });

  it("un vétérinaire ne voit que ses dossiers : Caramel n'existe pas pour Hugo", async () => {
    const answer = await stive.ask(hugo, { question: "Résumé de Caramel" });
    expect(answer.kind).toBe("choose");
    expect(JSON.stringify(answer)).not.toContain("Caramel");
  });

  it("une assistante sans accès clinique : l'organisation, jamais un résumé", async () => {
    expect(
      await stive.ask(lea, { question: "Résumé du dossier de Moka" }),
    ).toMatchObject({ kind: "unavailable", reason: "not_clinical" });
    const briefing = expectKind(
      await stive.ask(lea, { question: "Mon point du jour" }),
      "briefing",
    );
    expect(briefing).toMatchObject({
      urgent: [],
      watch: [],
      unacknowledged: null,
    });
    expect(briefing.agenda).not.toBeNull();
    // Elle ne peut pas confirmer : les rendez-vous sont en lecture.
    expect(
      await stive.ask(lea, { question: "Rendez-vous à confirmer" }),
    ).toMatchObject({ kind: "appointments" });
  });

  it("un droit retiré s'applique aussitôt à l'historique : l'agenda disparaît", async () => {
    expectKind(
      await stive.ask(lea, { question: "Mon point du jour" }),
      "briefing",
    );
    const withoutAgenda: Actor = {
      ...lea,
      permissions: new Set(
        [...lea.permissions].filter(
          (permission) => permission !== "agenda.read",
        ),
      ),
    };
    const { entries } = await stive.conversation(withoutAgenda);
    const last = entries.filter((entry) => entry.author === "stive").at(-1);
    expect(last).toMatchObject({
      answer: { kind: "briefing", agenda: null, pendingAppointments: null },
    });
  });

  it("un dossier rendu privé disparaît de l'historique de ceux qui n'y ont plus accès", async () => {
    const filou = idOf("Filou");
    const summary = expectKind(
      await stive.ask(claire, { question: "Où en est Filou ?" }),
      "summary",
    );
    expect(summary.followup.id).toBe(filou);
    await suivis.setPrivate(hugo, filou, true);
    try {
      const { entries } = await stive.conversation(claire);
      const last = entries.filter((entry) => entry.author === "stive").at(-1);
      expect(last).toMatchObject({ author: "stive", answer: null });
      const again = await stive.ask(claire, { question: "Résumé de Filou" });
      expect(JSON.stringify(again)).not.toContain("Filou");
    } finally {
      await suivis.setPrivate(hugo, filou, false);
    }
  });
});

describe("Stive : aucune action sans confirmation", () => {
  it("pause proposée, rien ne change avant le clic ; le clic passe par l'action de l'écran", async () => {
    const ruby = idOf("Ruby");
    const status = async () => {
      const { rows } = await admin.query(
        "SELECT status FROM followups WHERE id = $1",
        [ruby],
      );
      return (rows[0] as { status: string }).status;
    };
    const card = expectKind(
      await stive.ask(claire, { question: "Mets Ruby en pause" }),
      "status",
    );
    expect(card.change).toBe("pause");
    expect(await status()).toBe("active");

    // La carte de Claire n'existe pas pour Hugo.
    expect(await refusal(stive.decide(hugo, card.proposalId, "confirm"))).toBe(
      "not_found",
    );

    try {
      expect(await stive.decide(claire, card.proposalId, "confirm")).toBe(
        "paused",
      );
      expect(await status()).toBe("paused");
      expect(await auditCount("followup.paused", ruby)).toBeGreaterThan(0);
      expect(await auditCount("stive.action_confirmed", ruby)).toBe(1);
      // Une carte ne sert qu'une fois.
      expect(
        await refusal(stive.decide(claire, card.proposalId, "confirm")),
      ).toBe("invalid_transition");
    } finally {
      await launch.changeStatus(claire, ruby, "resume");
    }
  });

  it("un rendez-vous demandé se confirme depuis la carte, avec les droits de l'agenda", async () => {
    const ruby = idOf("Ruby");
    const [start] = await withTenant(
      appDb,
      { organizationId: claire.organizationId },
      (tx) =>
        findSlots(tx, {
          membershipId: claire.membershipId,
          minutes: 30,
          now: new Date(),
          limit: 1,
        }),
    );
    if (!start) throw new Error("aucun créneau libre pour Claire");
    const [proposed] = await withTenant(
      appDb,
      { organizationId: claire.organizationId },
      async (tx) => {
        const [animal] = await tx
          .select({ animalId: followups.animalId })
          .from(followups)
          .where(eq(followups.id, ruby));
        return tx
          .insert(appointmentRows)
          .values({
            organizationId: claire.organizationId,
            followupId: ruby,
            animalId: animal?.animalId ?? "",
            membershipId: claire.membershipId,
            kind: "post_op_control",
            status: "proposed",
            source: "numa",
            startsAt: start,
            endsAt: new Date(start.getTime() + 30 * 60_000),
          })
          .returning({ id: appointmentRows.id });
      },
    );
    if (!proposed) throw new Error("rendez-vous non créé");

    // Sans le droit de confirmer, la carte est en lecture.
    const readOnly = expectKind(
      await stive.ask(lea, { question: "Rendez-vous demandés" }),
      "appointments",
    );
    expect(
      readOnly.items.find((item) => item.followupId === ruby)?.proposalId,
    ).toBeNull();

    const list = expectKind(
      await stive.ask(claire, { question: "Rendez-vous à confirmer" }),
      "appointments",
    );
    const item = list.items.find((entry) => entry.followupId === ruby);
    expect(item?.proposalId).toBeTruthy();
    expect(await stive.decide(claire, item?.proposalId ?? "", "confirm")).toBe(
      "confirmed",
    );
    const { rows } = await admin.query(
      "SELECT status, confirmed_by_membership_id FROM appointments WHERE id = $1",
      [proposed.id],
    );
    expect(rows[0]).toEqual({
      status: "confirmed",
      confirmed_by_membership_id: claire.membershipId,
    });
    expect(await auditCount("appointment.confirmed", ruby)).toBeGreaterThan(0);
  });

  it("un brouillon n'envoie rien : il attend le clic sur Envoyer dans le dossier", async () => {
    const caramel = idOf("Caramel");
    const count = () =>
      withTenant(appDb, { organizationId: claire.organizationId }, (tx) =>
        tx
          .select({ id: messages.id })
          .from(messages)
          .where(eq(messages.followupId, caramel)),
      ).then((rows) => rows.length);
    const before = await count();
    const draft = expectKind(
      await stive.ask(claire, {
        question: "Rédige un message pour demander une photo",
        followupId: caramel,
      }),
      "draft",
    );
    expect(draft.followup.id).toBe(caramel);
    expect(await count()).toBe(before);
    const text = await stive.draftFor(claire, draft.proposalId, caramel);
    expect(text).toContain("photo récente de Caramel");
    expect(text).toContain("Dr Claire Fontaine");
    // Ni un autre membre, ni un autre dossier.
    expect(await stive.draftFor(hugo, draft.proposalId, caramel)).toBeNull();
    expect(
      await stive.draftFor(claire, draft.proposalId, idOf("Moka")),
    ).toBeNull();
  });
});

describe("Stive : offre et limite du mois", () => {
  it("Starter : pas de Stive (droit retiré par l'offre, limite à zéro en base)", async () => {
    const withoutStive = await actor(
      "paul.martin@cabinet-martin.test",
      ROLE_PERMISSIONS.admin_vet.defaults.filter((key) => key !== "stive.use"),
    );
    expect(
      await refusal(stive.ask(withoutStive, { question: "Mon point du jour" })),
    ).toBe("not_found");
    // Même avec un droit forcé, la formule ne compte aucune demande.
    expect(
      await stive.ask(paul, { question: "Mon point du jour" }),
    ).toMatchObject({ kind: "limit", limit: 0, upgrade: true });
  });

  it("à la limite, Stive propose l'offre supérieure et ne compte plus", async () => {
    const month = parisMonth(new Date());
    await admin.query(
      `INSERT INTO stive_usage (organization_id, membership_id, month, requests)
       VALUES ($1, $2, $3, 600)
       ON CONFLICT (membership_id, month) DO UPDATE SET requests = 600`,
      [hugo.organizationId, hugo.membershipId, month],
    );
    try {
      // Les Tilleuls sont en Premium : 600 demandes, pas d'offre supérieure.
      expect(
        await stive.ask(hugo, { question: "Mon point du jour" }),
      ).toMatchObject({ kind: "limit", limit: 600, upgrade: false });
      const { usage } = await stive.conversation(hugo);
      expect(usage).toEqual({ used: 600, limit: 600 });
    } finally {
      await admin.query("DELETE FROM stive_usage WHERE membership_id = $1", [
        hugo.membershipId,
      ]);
    }
  });

  it("chaque demande compte une fois", async () => {
    const before = (await stive.conversation(claire)).usage.used;
    await stive.ask(claire, { question: "Mes créneaux libres demain" });
    expect((await stive.conversation(claire)).usage.used).toBe(before + 1);
  });
});

describe("Stive : confidentialité et conservation", () => {
  it("les échanges ne sont visibles que par leur auteur, même pour l'administratrice", async () => {
    await stive.ask(hugo, { question: "Mon point du jour" });
    const asClaire = await withTenant(
      appDb,
      { organizationId: claire.organizationId, userId: claire.userId },
      (tx) =>
        tx.execute(
          sql`SELECT count(*)::int AS n FROM stive_messages WHERE membership_id = ${hugo.membershipId}`,
        ),
    );
    expect(asClaire.rows[0]).toEqual({ n: 0 });
    // Sans personne connectée (tâche de fond), aucun échange n'est lisible non plus.
    const asWorker = await withTenant(
      appDb,
      { organizationId: claire.organizationId },
      (tx) => tx.execute(sql`SELECT count(*)::int AS n FROM stive_messages`),
    );
    expect(asWorker.rows[0]).toEqual({ n: 0 });
    // Ni écrire au nom d'un autre.
    await expect(
      withTenant(
        appDb,
        { organizationId: claire.organizationId, userId: claire.userId },
        (tx) =>
          tx.execute(
            sql`INSERT INTO stive_messages (organization_id, membership_id, author, question)
                VALUES (${claire.organizationId}, ${hugo.membershipId}, 'member', 'intrus')`,
          ),
      ),
    ).rejects.toThrow();
  });

  it("efface les échanges de plus de 30 jours, du seul cabinet courant", async () => {
    const old = new Date(Date.now() - 31 * 86_400_000);
    await admin.query(
      `INSERT INTO stive_messages (organization_id, membership_id, author, question, created_at)
       VALUES ($1, $2, 'member', 'ancienne question', $3), ($4, $5, 'member', 'ancienne question', $3)`,
      [
        hugo.organizationId,
        hugo.membershipId,
        old,
        paul.organizationId,
        paul.membershipId,
      ],
    );
    // Déjà hors de l'historique avant l'effacement.
    const visible = await stive.conversation(hugo);
    expect(
      visible.entries.some(
        (e) => e.author === "member" && e.question === "ancienne question",
      ),
    ).toBe(false);

    const purged = await withTenant(
      appDb,
      { organizationId: SEED.tilleuls },
      (tx) => tx.execute(sql`SELECT app.purge_stive_messages() AS removed`),
    );
    expect(purged.rows[0]).toEqual({ removed: 1 });
    const { rows } = await admin.query(
      "SELECT organization_id FROM stive_messages WHERE question = 'ancienne question'",
    );
    expect(rows).toEqual([{ organization_id: paul.organizationId }]);
    // Les échanges récents restent.
    expect((await stive.conversation(hugo)).entries.length).toBeGreaterThan(0);
  });

  it("« Effacer mes échanges » n'efface que ceux de la personne", async () => {
    const claireBefore = (await stive.conversation(claire)).entries.length;
    // Une proposition ouverte (pause de Nala), jamais confirmée.
    expect(
      (await stive.ask(hugo, { question: "Mets Nala en pause" })).kind,
    ).toBe("status");
    expect(await stive.clear(hugo)).toBeGreaterThan(0);
    expect((await stive.conversation(hugo)).entries).toEqual([]);
    expect((await stive.conversation(claire)).entries.length).toBe(
      claireBefore,
    );
    // Les propositions partent avec leurs échanges.
    const { rows } = await admin.query(
      "SELECT count(*)::int AS n FROM stive_proposals WHERE membership_id = $1",
      [hugo.membershipId],
    );
    expect(rows[0]).toEqual({ n: 0 });
  });
});
