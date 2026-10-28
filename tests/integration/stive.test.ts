import { randomBytes } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SEED } from "../../db/seed/cabinets-fictifs";
import { apiAiGateway } from "@/adapters/ai-gateway/api-compatible";
import { fakeAiGateway } from "@/adapters/ai-gateway/fake";
import { aiImitation } from "@/adapters/ai-gateway/imitation";
import { createFakeDrVeto } from "@/adapters/drveto/fake";
import { createMemoryStorage } from "@/adapters/object-storage/memory";
import { agendaService } from "@/domains/agenda/captures";
import { appointmentsService, findSlots } from "@/domains/agenda/demandes";
import { conversationsService } from "@/domains/conversations/service";
import { DomainError } from "@/domains/commun/actor";
import type { Actor } from "@/domains/commun/actor";
import { ROLE_PERMISSIONS } from "@/domains/equipe/permissions";
import type { PermissionKey } from "@/domains/equipe/permissions";
import { followupRefs } from "@/domains/stive/outils";
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
const deps = {
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
};
/** Stive simulé : règles écrites seulement (ADR 0034). */
const stive = stiveService({ ...deps, ai: fakeAiGateway });

/**
 * Stive branché sur la passerelle réelle, contre l'imitation locale du fournisseur (ADR
 * 0042) : aucun appel réseau, aucune clé dans le dépôt. Chaque requête est gardée pour
 * vérifier ce qui part chez le prestataire.
 */
const KEY = randomBytes(24).toString("hex");
const model = aiImitation({ apiKey: KEY });
const stiveIa = stiveService({
  ...deps,
  ai: apiAiGateway({
    fetch: model.fetch,
    baseUrl: "https://api.scaleway.ai/v1",
    apiKey: KEY,
    models: { text: "texte", vision: "vision", transcription: "voix" },
  }),
});

/** Requêtes de conversation envoyées au fournisseur depuis `start`. */
function chatRequests(start: number) {
  return model.requests
    .slice(start)
    .flatMap((request) => (request.kind === "stive_chat" ? [request] : []));
}

/** Résultats d'outils envoyés au fournisseur depuis `start`. */
function toolResults(start: number): string {
  return chatRequests(start)
    .flatMap((request) =>
      request.messages.filter((message) => message.role === "tool"),
    )
    .map((message) => message.content)
    .join("\n");
}

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

describe("Stive sans IA branchée : honnête (ADR 0042)", () => {
  it("salue, se présente comme une IA, et dit que la conversation libre demande l'IA", async () => {
    expect(await stive.ask(hugo, { question: "Bonjour Stive !" })).toEqual({
      kind: "smalltalk",
      topic: "greeting",
    });
    expect(await stive.ask(hugo, { question: "Qui es-tu ?" })).toEqual({
      kind: "smalltalk",
      topic: "identity",
    });
    expect(
      await stive.ask(hugo, {
        question: "Comment annoncer une complication à un propriétaire ?",
      }),
    ).toEqual({ kind: "unknown", mode: "simulated" });
    expect((await stive.conversation(hugo)).mode).toBe("simulated");
  });
});

describe("Stive conversationnel, IA branchée (ADR 0042)", () => {
  async function sushiId(): Promise<string> {
    const { rows } = await admin.query(
      "SELECT f.id FROM followups f JOIN animals a ON a.id = f.animal_id WHERE a.name = 'Sushi'",
    );
    const row = rows[0] as { id: string } | undefined;
    if (!row) throw new Error("Sushi introuvable");
    return row.id;
  }

  it("converse librement sur le métier, avec l'historique, une demande par message", async () => {
    await stiveIa.clear(hugo);
    const before = (await stiveIa.conversation(hugo)).usage.used;
    const start = model.requests.length;
    model.answerNext(
      {
        text: "Commencez par ce que vous avez constaté, puis laissez-lui le temps de poser ses questions. La décision vous revient.",
      },
      { text: "Proposez-lui un appel de suivi, à une heure qui l'arrange." },
    );
    expect(
      await stiveIa.ask(hugo, {
        question:
          "Comment annoncer une complication à un propriétaire inquiet ?",
      }),
    ).toMatchObject({
      kind: "reply",
      text: expect.stringContaining("Commencez par ce que vous avez constaté"),
      withheld: null,
    });
    await stiveIa.ask(hugo, { question: "Et s'il est en colère ?" });

    const conversation = await stiveIa.conversation(hugo);
    expect(conversation.mode).toBe("ai");
    expect(conversation.usage.used).toBe(before + 2);
    expect(
      conversation.entries.map((entry) =>
        entry.author === "member" ? entry.question : entry.answer?.kind,
      ),
    ).toEqual([
      "Comment annoncer une complication à un propriétaire inquiet ?",
      "reply",
      "Et s'il est en colère ?",
      "reply",
    ]);
    const [, second] = chatRequests(start);
    expect(second?.messages).toEqual([
      {
        role: "user",
        content:
          "Comment annoncer une complication à un propriétaire inquiet ?",
      },
      {
        role: "assistant",
        content:
          "Commencez par ce que vous avez constaté, puis laissez-lui le temps de poser ses questions. La décision vous revient.",
      },
      { role: "user", content: "Et s'il est en colère ?" },
    ]);
    expect(second?.system).toContain('"role":"vétérinaire"');
  });

  it("lit un dossier par ses outils, avec les droits de la personne : carte, journal, rien du propriétaire", async () => {
    const caramel = idOf("Caramel");
    const viewed = await auditCount("followup.viewed", caramel);
    const used = (await stiveIa.conversation(claire)).usage.used;
    // Référence que Stive donnera à Caramel pendant ce tour (ordre de la liste des suivis).
    const reference = followupRefs(await suivis.list(claire)).refOf(caramel);
    const start = model.requests.length;
    model.answerNext(
      {
        toolCalls: [
          { name: "chercher_suivis", arguments: { animal: "Caramel" } },
        ],
      },
      {
        toolCalls: [{ name: "lire_dossier", arguments: { suivi: reference } }],
      },
      {
        text: "Caramel est suivie de près ; une alerte attend votre accusé de réception.",
      },
    );
    const reply = await stiveIa.ask(claire, {
      question: "Où en est Caramel ?",
    });
    expect(toolResults(start)).toContain(
      `"ref":"${reference}","animal":"Caramel"`,
    );
    expect(reply).toMatchObject({ kind: "reply", withheld: null });
    const { entries, usage } = await stiveIa.conversation(claire);
    // Un seul message de la personne : une seule demande, quels que soient les outils.
    expect(usage.used).toBe(used + 1);
    expect(
      entries
        .slice(-2)
        .map((entry) => (entry.author === "stive" ? entry.answer?.kind : null)),
    ).toEqual(["reply", "summary"]);
    expect(await auditCount("followup.viewed", caramel)).toBe(viewed + 1);
    const sent = JSON.stringify(model.requests.slice(start));
    expect(sent).toContain("Caramel");
    for (const secret of [
      "Julien",
      "Morel",
      "06 39",
      caramel,
      claire.membershipId,
    ])
      expect(sent).not.toContain(secret);
  });

  it("le résumé d'un dossier est une carte, et la consultation est tracée", async () => {
    const caramel = idOf("Caramel");
    const viewed = await auditCount("followup.viewed", caramel);
    const start = model.requests.length;
    model.answerNext(
      {
        toolCalls: [{ name: "lire_dossier", arguments: { animal: "Caramel" } }],
      },
      { text: "Voici le résumé de Caramel." },
    );
    await stiveIa.ask(claire, { question: "Résume-moi Caramel" });
    const { entries } = await stiveIa.conversation(claire);
    const [reply, card] = entries.slice(-2);
    expect(reply).toMatchObject({
      author: "stive",
      answer: {
        kind: "reply",
        sources: {
          followups: [{ id: caramel, access: "clinical" }],
          agenda: false,
        },
      },
    });
    expect(card).toMatchObject({
      author: "stive",
      answer: { kind: "summary", followup: { id: caramel } },
    });
    expect(await auditCount("followup.viewed", caramel)).toBe(viewed + 1);
    const results = toolResults(start);
    expect(results).toContain("synthese_non_fiable");
    expect(results).toContain("Ovariectomie");
    expect(results).not.toContain("Julien");
  });

  it("aucun dossier hors accès : autre vétérinaire, assistante sans accès clinique, dossier privé, autre cabinet", async () => {
    const caramel = idOf("Caramel");
    const filou = idOf("Filou");
    const sushi = await sushiId();
    const caramelViews = await auditCount("followup.viewed", caramel);
    const filouViews = await auditCount("followup.viewed", filou);

    // Hugo ne suit pas Caramel : le dossier n'existe pas pour lui.
    let start = model.requests.length;
    model.answerNext(
      {
        toolCalls: [{ name: "lire_dossier", arguments: { animal: "Caramel" } }],
      },
      { text: "Je ne trouve pas ce dossier dans votre périmètre." },
    );
    await stiveIa.ask(hugo, { question: "Résume Caramel" });
    expect(toolResults(start)).not.toContain("Caramel");
    expect(toolResults(start)).not.toContain("Ovariectomie");
    expect((await stiveIa.conversation(hugo)).entries.at(-1)).toMatchObject({
      answer: { kind: "reply" },
    });

    // Léa, sans accès clinique : un refus, jamais une synthèse.
    start = model.requests.length;
    model.answerNext(
      { toolCalls: [{ name: "lire_dossier", arguments: { animal: "Moka" } }] },
      { text: "Je ne peux pas vous montrer ce dossier." },
    );
    await stiveIa.ask(lea, { question: "Comment va Moka ?" });
    expect(toolResults(start)).toContain("refus");
    expect(toolResults(start)).not.toContain("synthese");

    // Filou rendu privé par Hugo : invisible pour Claire, même nommé.
    await suivis.setPrivate(hugo, filou, true);
    try {
      start = model.requests.length;
      model.answerNext(
        {
          toolCalls: [
            { name: "chercher_suivis", arguments: { animal: "Filou" } },
            { name: "lire_dossier", arguments: { animal: "Filou" } },
          ],
        },
        { text: "Je ne trouve pas de suivi à ce nom." },
      );
      await stiveIa.ask(claire, { question: "Et Filou ?" });
      expect(toolResults(start)).not.toContain("Filou");
      expect(toolResults(start)).toContain('"total":0');
    } finally {
      await suivis.setPrivate(hugo, filou, false);
    }

    // Autre cabinet : ni par son nom, ni par son identifiant passé en contexte.
    start = model.requests.length;
    model.answerNext(
      {
        toolCalls: [
          { name: "lire_dossier", arguments: { animal: "Sushi" } },
          { name: "lire_dossier", arguments: { suivi: "S99" } },
        ],
      },
      { text: "Je ne trouve pas ce dossier." },
    );
    await stiveIa.ask(claire, { question: "Et Sushi ?", followupId: sushi });
    expect(toolResults(start)).not.toContain("Sushi");
    expect(chatRequests(start)[0]?.system).toContain('"dossier_ouvert":null');
    // Aucune consultation tracée pour ces refus.
    expect(await auditCount("followup.viewed", caramel)).toBe(caramelViews);
    expect(await auditCount("followup.viewed", filou)).toBe(filouViews);
  });

  it("une réponse sur un dossier devenu privé disparaît, et ne repart pas chez le prestataire", async () => {
    const filou = idOf("Filou");
    model.answerNext(
      { toolCalls: [{ name: "lire_dossier", arguments: { animal: "Filou" } }] },
      { text: "Filou se remet bien d'après les échanges." },
    );
    await stiveIa.ask(claire, { question: "Où en est Filou ?" });
    await suivis.setPrivate(hugo, filou, true);
    try {
      const { entries } = await stiveIa.conversation(claire);
      expect(
        entries
          .slice(-2)
          .map((entry) => entry.author === "stive" && entry.answer),
      ).toEqual([null, null]);
      const start = model.requests.length;
      model.answerNext({ text: "Bien sûr." });
      await stiveIa.ask(claire, { question: "Merci, autre chose ?" });
      const [request] = chatRequests(start);
      const history = JSON.stringify(request?.messages);
      expect(history).toContain("Réponse masquée");
      expect(history).not.toContain("Filou se remet bien");
    } finally {
      await suivis.setPrivate(hugo, filou, false);
    }
  });

  it("une action reste une carte « À confirmer » : rien ne change avant le clic", async () => {
    const ruby = idOf("Ruby");
    model.answerNext(
      {
        toolCalls: [
          {
            name: "proposer_changement_suivi",
            arguments: { animal: "Ruby", changement: "pause" },
          },
        ],
      },
      { text: "J'ai préparé la mise en pause : confirmez-la sur la carte." },
    );
    await stiveIa.ask(claire, { question: "Mets Ruby en pause s'il te plaît" });
    const { entries } = await stiveIa.conversation(claire);
    const card = entries.at(-1);
    if (card?.author !== "stive" || card.answer?.kind !== "status")
      throw new Error("carte attendue");
    const { rows } = await admin.query(
      "SELECT status FROM followups WHERE id = $1",
      [ruby],
    );
    expect(rows[0]).toEqual({ status: "active" });
    try {
      expect(
        await stiveIa.decide(claire, card.answer.proposalId, "confirm"),
      ).toBe("paused");
    } finally {
      await launch.changeStatus(claire, ruby, "resume");
    }
  });

  it("un dosage est remplacé par le renvoi au référentiel, sans rien garder du texte", async () => {
    model.answerNext({
      text: "Pour un chat, comptez 0,05 mg/kg de méloxicam une fois par jour.",
    });
    expect(
      await stiveIa.ask(hugo, {
        question: "Quelle dose de méloxicam pour un chat ?",
      }),
    ).toMatchObject({ kind: "reply", text: null, withheld: "dosage" });
    const { rows } = await admin.query(
      "SELECT count(*)::int AS n FROM stive_messages WHERE answer::text LIKE '%mg/kg%'",
    );
    expect(rows[0]).toEqual({ n: 0 });
  });

  it("IA injoignable : les règles écrites prennent le relais, sans rien inventer", async () => {
    model.answerNext({ status: 503 }, { status: 503 });
    expect(
      (await stiveIa.ask(claire, { question: "Mon point du jour" })).kind,
    ).toBe("briefing");
    expect(
      await stiveIa.ask(claire, {
        question: "Comment gérer un client agressif au téléphone ?",
      }),
    ).toEqual({ kind: "unknown", mode: "ai_unavailable" });
  });

  it("à la limite du mois, aucun appel au prestataire", async () => {
    const month = parisMonth(new Date());
    await admin.query(
      `INSERT INTO stive_usage (organization_id, membership_id, month, requests)
       VALUES ($1, $2, $3, 600)
       ON CONFLICT (membership_id, month) DO UPDATE SET requests = 600`,
      [hugo.organizationId, hugo.membershipId, month],
    );
    try {
      const start = model.requests.length;
      expect(
        await stiveIa.ask(hugo, {
          question: "Comment organiser mes rappels ?",
        }),
      ).toMatchObject({ kind: "limit", limit: 600 });
      expect(model.requests.length).toBe(start);
    } finally {
      await admin.query("DELETE FROM stive_usage WHERE membership_id = $1", [
        hugo.membershipId,
      ]);
    }
  });
});
