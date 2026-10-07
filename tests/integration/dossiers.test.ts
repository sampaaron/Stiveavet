import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SEED } from "../../db/seed/cabinets-fictifs";
import type { Actor } from "@/domains/equipe/actor";
import { ROLE_PERMISSIONS } from "@/domains/equipe/permissions";
import { followupsService } from "@/domains/suivis/service";
import { followups as fixtureFollowups } from "@/fixtures/cabinet-tilleuls";

import { asApp, errorCode, pools } from "./support/db";

const { app, admin, appDb } = pools();
afterAll(async () => {
  await app.end();
  await admin.end();
});

const suivis = followupsService(appDb);
const caramel = fixtureFollowups[0]!;

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

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await admin.query(sql, params);
  if (!rows[0]) throw new Error("Aucune ligne");
  return rows[0] as T;
}

let claire: Actor;
let hugo: Actor;
let lea: Actor;
beforeAll(async () => {
  claire = await actor("claire.fontaine@tilleuls.test");
  hugo = await actor("hugo.marchal@tilleuls.test");
  lea = await actor("lea.roux@tilleuls.test");
});

describe("jeu fictif des dossiers", () => {
  it.each([
    "followup_contacts",
    "followup_status_events",
    "consents",
    "conversation_threads",
    "messages",
    "triage_events",
    "alerts",
    "appointments",
    "outbox_events",
    "scheduled_jobs",
    "notification_deliveries",
  ])(
    "%s a des lignes dans les deux cabinets (l'isolation n'est pas testée à vide)",
    async (table) => {
      const { rows } = await admin.query(
        `SELECT organization_id, count(*)::int AS n FROM ${table} GROUP BY organization_id`,
      );
      const counts = new Map(
        rows.map((row: { organization_id: string; n: number }) => [
          row.organization_id,
          row.n,
        ]),
      );
      expect(counts.get(SEED.tilleuls)).toBeGreaterThan(0);
      expect(counts.get(SEED.martin)).toBeGreaterThan(0);
    },
  );

  it("photo et vocal de Caramel sont rattachés, avec la transcription du vocal", async () => {
    const { rows } = await admin.query(
      `SELECT a.kind, t.text IS NOT NULL AS transcribed FROM attachments a
       LEFT JOIN voice_transcripts t ON t.attachment_id = a.id
       WHERE a.followup_id = $1 ORDER BY a.kind`,
      [caramel.id],
    );
    expect(rows).toEqual([
      { kind: "photo", transcribed: false },
      { kind: "voice", transcribed: true },
    ]);
  });
});

describe("contenu du dossier selon les droits", () => {
  it("le vétérinaire responsable lit la conversation, les pièces jointes, le triage et les alertes", async () => {
    const opened = await suivis.open(claire, caramel.id);
    const record = opened?.record;
    if (record?.access !== "clinical")
      throw new Error("accès clinique attendu");

    expect(record.contacts.map((c) => [c.name, c.role, c.consent])).toEqual([
      ["Julien Morel", "primary", "given"],
      ["Sophie Morel", "secondary", "requested"],
    ]);
    expect(record.messages).toHaveLength(caramel.messages.length);
    const bleeding = record.messages.find((m) =>
      m.body.includes("sang sur la plaie"),
    );
    expect(bleeding).toMatchObject({
      author: "owner",
      authorName: "Julien Morel",
    });
    expect(bleeding?.attachments.map((a) => a.kind)).toEqual(["photo"]);
    const voice = record.messages
      .flatMap((m) => m.attachments)
      .find((a) => a.kind === "voice");
    expect(voice?.transcript).toContain("le pansement est rouge");
    expect(record.triage[0]?.level).toBe("urgent");
    expect(record.alerts).toEqual([
      expect.objectContaining({
        level: "urgent",
        status: "open",
        targetName: "Dr Claire Fontaine",
        acknowledgedBy: [],
      }),
    ]);
    const alert = record.alerts[0]!;
    const delay =
      (alert.escalateAt?.getTime() ?? 0) - alert.createdAt.getTime();
    expect(delay).toBe(240 * 60_000);
  });

  it("l'assistante ne reçoit que les contacts : aucun message, pièce jointe, transcription, triage ou numéro", async () => {
    const opened = await suivis.open(lea, caramel.id);
    expect(opened?.record.access).toBe("summary");
    expect(Object.keys(opened?.record ?? {}).sort()).toEqual([
      "access",
      "contacts",
    ]);

    const serialized = JSON.stringify(opened);
    for (const clinical of [
      "sang",
      "pansement",
      "Signe d'alerte",
      "messages",
      "transcript",
      'triage":"urgent',
      ...caramel.owners.map((owner) => owner.phone),
    ])
      expect(serialized).not.toContain(clinical);
  });

  it("un vétérinaire ni responsable ni destinataire d'un partage n'obtient pas le dossier", async () => {
    expect(await suivis.open(hugo, caramel.id)).toBeNull();
  });

  it("un autre cabinet n'obtient pas le dossier", async () => {
    const paul = await actor("paul.martin@cabinet-martin.test");
    expect(await suivis.open(paul, caramel.id)).toBeNull();
  });
});

describe("historique des statuts", () => {
  it("chaque changement de statut est écrit par la base, avec l'auteur et le motif", async () => {
    const events = await asApp(app, SEED.tilleuls, async (client) => {
      await client.query("SELECT set_config('app.user_id', $1, true)", [
        claire.userId,
      ]);
      await client.query(
        "SELECT set_config('app.status_reason', 'vet_paused', true)",
      );
      await client.query(
        "UPDATE followups SET status = 'paused' WHERE id = $1",
        [caramel.id],
      );
      // Même statut : pas de nouvel événement.
      await client.query(
        "UPDATE followups SET status = 'paused' WHERE id = $1",
        [caramel.id],
      );
      const { rows } = await client.query(
        `SELECT from_status, to_status, actor_membership_id, reason
         FROM followup_status_events WHERE followup_id = $1 ORDER BY occurred_at, to_status`,
        [caramel.id],
      );
      return rows;
    });

    expect(events.at(-1)).toEqual({
      from_status: "active",
      to_status: "paused",
      actor_membership_id: claire.membershipId,
      reason: "vet_paused",
    });
    expect(
      events.filter((e: { to_status: string }) => e.to_status === "paused"),
    ).toHaveLength(1);
  });

  it("un nouveau suivi ouvre son historique", async () => {
    const created = await asApp(app, SEED.tilleuls, async (client) => {
      const animal = await client.query("SELECT id FROM animals LIMIT 1");
      const id = randomUUID();
      await client.query(
        `INSERT INTO followups (id, organization_id, animal_id, responsible_membership_id, procedure, procedure_at)
         VALUES ($1, $2, $3, $4, 'Test', now())`,
        [id, SEED.tilleuls, animal.rows[0]?.id, claire.membershipId],
      );
      const { rows } = await client.query(
        "SELECT from_status, to_status, actor_membership_id FROM followup_status_events WHERE followup_id = $1",
        [id],
      );
      return rows;
    });

    expect(created).toEqual([
      { from_status: null, to_status: "draft", actor_membership_id: null },
    ]);
  });
});

describe("historiques en ajout seul et contenus non modifiables", () => {
  it.each([
    [
      "followup_status_events",
      "UPDATE followup_status_events SET reason = 'x_y'",
    ],
    ["consents", "UPDATE consents SET state = 'given'"],
    ["triage_events", "UPDATE triage_events SET level = 'normal'"],
    ["acknowledgements", "UPDATE acknowledgements SET acknowledged_at = now()"],
    ["messages (contenu)", "UPDATE messages SET body = 'modifié'"],
    ["voice_transcripts", "UPDATE voice_transcripts SET text = 'modifié'"],
    [
      "attachments (clé)",
      "UPDATE attachments SET storage_key = 'autre/cle/fictive'",
    ],
  ])("%s : modification refusée", async (_label, statement) => {
    const code = await asApp(app, SEED.tilleuls, (client) =>
      errorCode(client.query(statement)),
    );
    expect(code).toBe("42501");
  });

  it.each([
    "messages",
    "consents",
    "attachments",
    "voice_transcripts",
    "triage_events",
    "alerts",
    "acknowledgements",
    "followup_status_events",
    "scheduled_jobs",
    "job_attempts",
    "notification_deliveries",
  ])("%s : suppression directe refusée à l'application", async (table) => {
    const code = await asApp(app, SEED.tilleuls, (client) =>
      errorCode(client.query(`DELETE FROM ${table}`)),
    );
    expect(code).toBe("42501");
  });

  it("l'état d'envoi d'un message sortant reste modifiable", async () => {
    const updated = await asApp(app, SEED.tilleuls, async (client) => {
      const result = await client.query(
        "UPDATE messages SET delivery_status = 'failed', failed_at = now(), error_code = 'provider_unavailable' WHERE direction = 'outbound'",
      );
      return result.rowCount;
    });
    expect(updated).toBeGreaterThan(0);
  });
});

describe("cohérence imposée par la base", () => {
  async function ids() {
    return one<{
      followup: string;
      thread: string;
      contact: string;
      other_followup: string;
      other_thread: string;
      martin_member: string;
      triage: string;
    }>(
      `SELECT f.id AS followup, t.id AS thread, t.followup_contact_id AS contact,
              f2.id AS other_followup, t2.id AS other_thread,
              (SELECT id FROM memberships WHERE organization_id = $2 LIMIT 1) AS martin_member,
              (SELECT id FROM triage_events WHERE followup_id = f.id LIMIT 1) AS triage
       FROM followups f
       JOIN conversation_threads t ON t.followup_id = f.id
       JOIN followups f2 ON f2.organization_id = f.organization_id AND f2.id <> f.id
       JOIN conversation_threads t2 ON t2.followup_id = f2.id
       WHERE f.id = $1 LIMIT 1`,
      [caramel.id, SEED.martin],
    );
  }

  it("un message ne peut pas être rangé dans le fil d'un autre suivi", async () => {
    const ref = await ids();
    const code = await asApp(app, SEED.tilleuls, (client) =>
      errorCode(
        client.query(
          `INSERT INTO messages (organization_id, followup_id, thread_id, direction, author, followup_contact_id, body)
           VALUES ($1, $2, $3, 'inbound', 'owner', $4, 'Bonjour')`,
          [SEED.tilleuls, ref.followup, ref.other_thread, ref.contact],
        ),
      ),
    );
    expect(code).toBe("23503");
  });

  it("une alerte ne peut pas viser le membre d'un autre cabinet", async () => {
    const ref = await ids();
    const code = await asApp(app, SEED.tilleuls, async (client) => {
      const triage = await client.query(
        `INSERT INTO triage_events (organization_id, followup_id, level, source, reason)
         VALUES ($1, $2, 'watch', 'rule', 'Test') RETURNING id`,
        [SEED.tilleuls, ref.followup],
      );
      return errorCode(
        client.query(
          `INSERT INTO alerts (organization_id, followup_id, triage_event_id, level, target_membership_id)
           VALUES ($1, $2, $3, 'watch', $4)`,
          [SEED.tilleuls, ref.followup, triage.rows[0]?.id, ref.martin_member],
        ),
      );
    });
    expect(code).toBe("23503");
  });

  it("un envoi sans clé d'idempotence est refusé, et une clé ne sert qu'une fois", async () => {
    const ref = await ids();
    const insert = (key: string | null) =>
      `INSERT INTO messages (organization_id, followup_id, thread_id, direction, author, followup_contact_id, body, delivery_status, idempotency_key)
       VALUES ('${SEED.tilleuls}', '${ref.followup}', '${ref.thread}', 'outbound', 'numa', '${ref.contact}', 'Bonjour', 'queued', ${key ? `'${key}'` : "NULL"})`;
    const withoutKey = await asApp(app, SEED.tilleuls, (client) =>
      errorCode(client.query(insert(null))),
    );
    const duplicate = await asApp(app, SEED.tilleuls, async (client) => {
      await client.query(insert("envoi:test:0001"));
      return errorCode(client.query(insert("envoi:test:0001")));
    });
    expect([withoutKey, duplicate]).toEqual(["23514", "23505"]);
  });

  it("un message de Numa ne peut pas se faire passer pour le propriétaire", async () => {
    const ref = await ids();
    const code = await asApp(app, SEED.tilleuls, (client) =>
      errorCode(
        client.query(
          `INSERT INTO messages (organization_id, followup_id, thread_id, direction, author, followup_contact_id, body)
           VALUES ($1, $2, $3, 'inbound', 'numa', $4, 'Bonjour')`,
          [SEED.tilleuls, ref.followup, ref.thread, ref.contact],
        ),
      ),
    );
    expect(code).toBe("23514");
  });

  it.each([
    [
      "une URL au lieu d'une clé de stockage",
      "https://exemple.test/photo.jpg",
      "photo",
      "now() + interval '1 year'",
    ],
    [
      "une capture d'agenda gardée plus d'un jour",
      "captures/agenda-0001.png",
      "agenda_capture",
      "now() + interval '2 days'",
    ],
    [
      "une conservation au-delà de 15 mois",
      "fichiers/photo-0001.jpg",
      "photo",
      "now() + interval '2 years'",
    ],
  ])("refuse %s", async (_label, key, kind, retention) => {
    const ref = await ids();
    const code = await asApp(app, SEED.tilleuls, (client) =>
      errorCode(
        client.query(
          `INSERT INTO attachments (organization_id, followup_id, kind, storage_key, content_type, byte_size, sha256, retention_until)
           VALUES ($1, $2, $3, $4, 'image/png', 1000, repeat('a', 64), ${retention})`,
          [
            SEED.tilleuls,
            kind === "agenda_capture" ? null : ref.followup,
            kind,
            key,
          ],
        ),
      ),
    );
    expect(code).toBe("23514");
  });

  it("une transcription ne porte que sur un vocal", async () => {
    const photo = await one<{ id: string }>(
      "SELECT id FROM attachments WHERE followup_id = $1 AND kind = 'photo'",
      [caramel.id],
    );
    const code = await asApp(app, SEED.tilleuls, (client) =>
      errorCode(
        client.query(
          `INSERT INTO voice_transcripts (organization_id, followup_id, attachment_id, text)
           VALUES ($1, $2, $3, 'texte')`,
          [SEED.tilleuls, caramel.id, photo.id],
        ),
      ),
    );
    expect(code).toBe("23514");
  });

  it.each([
    ["2 heures", "2 hours", "23514"],
    ["6 heures", "6 hours", "23514"],
    ["3 heures", "3 hours", undefined],
    ["5 heures", "5 hours", undefined],
  ])(
    "escalade d'une urgence programmée à %s : %s",
    async (_label, delay, expected) => {
      const ref = await ids();
      const code = await asApp(app, SEED.tilleuls, async (client) => {
        const triage = await client.query(
          `INSERT INTO triage_events (organization_id, followup_id, level, source, reason)
           VALUES ($1, $2, 'urgent', 'rule', 'Test') RETURNING id`,
          [SEED.tilleuls, ref.followup],
        );
        return errorCode(
          client.query(
            `INSERT INTO alerts (organization_id, followup_id, triage_event_id, level, target_membership_id, escalate_at)
             VALUES ($1, $2, $3, 'urgent', $4, now() + interval '${delay}')`,
            [
              SEED.tilleuls,
              ref.followup,
              triage.rows[0]?.id,
              claire.membershipId,
            ],
          ),
        );
      });
      expect(code).toBe(expected);
    },
  );

  it("une tâche n'est jamais inscrite deux fois, et sa charge utile reste petite", async () => {
    const insert = (key: string, payload: string) =>
      `INSERT INTO scheduled_jobs (organization_id, kind, idempotency_key, run_at, payload)
       VALUES ('${SEED.tilleuls}', 'followup.reminder', '${key}', now(), '${payload}'::jsonb)`;
    const duplicate = await asApp(app, SEED.tilleuls, async (client) => {
      await client.query(insert("tache:test:0001", "{}"));
      return errorCode(client.query(insert("tache:test:0001", "{}")));
    });
    const tooLarge = await asApp(app, SEED.tilleuls, (client) =>
      errorCode(
        client.query(
          insert("tache:test:0002", JSON.stringify({ x: "a".repeat(3000) })),
        ),
      ),
    );
    expect([duplicate, tooLarge]).toEqual(["23505", "23514"]);
  });

  it("un seul groupe ouvert par suivi", async () => {
    const ref = await ids();
    const code = await asApp(app, SEED.tilleuls, async (client) => {
      await client.query(
        "INSERT INTO conversation_threads (organization_id, followup_id, kind) VALUES ($1, $2, 'group')",
        [SEED.tilleuls, ref.followup],
      );
      return errorCode(
        client.query(
          "INSERT INTO conversation_threads (organization_id, followup_id, kind) VALUES ($1, $2, 'group')",
          [SEED.tilleuls, ref.followup],
        ),
      );
    });
    expect(code).toBe("23505");
  });
});
