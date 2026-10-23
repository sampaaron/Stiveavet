import { randomUUID } from "node:crypto";
import path from "node:path";

import { Client, Pool } from "pg";
import type { PoolClient } from "pg";
import { afterAll, describe, expect, it, inject } from "vitest";

import { SEED, createOrganization } from "../../db/seed/cabinets-fictifs";
import {
  MIGRATION_LOCK_KEY,
  loadMigrations,
  migrateUp,
} from "@/server/db/migrations";

import { asApp, errorCode, pools } from "./support/db";

/**
 * Durcissement de la base après l'audit (migration 0026, ADR 0038) : droits par colonne,
 * identité figée, journaux protégés même du propriétaire, verrous de concurrence et
 * search_path des fonctions SECURITY DEFINER.
 */

const { app, admin, appDb } = pools();
const owner = new Pool({ connectionString: inject("migratorUrl"), max: 2 });
afterAll(async () => {
  await app.end();
  await admin.end();
  await owner.end();
});

/** Exécute `run` en tant que propriétaire du schéma, cabinet fixé, puis annule tout. */
async function asOwner<T>(
  organizationId: string,
  run: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await owner.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.organization_id', $1, true)", [
      organizationId,
    ]);
    return await run(client);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

async function one<T>(sql: string, values: unknown[] = []): Promise<T> {
  const { rows } = await admin.query(sql, values);
  if (!rows[0]) throw new Error("ligne attendue");
  return rows[0] as T;
}

describe("droits de mise à jour par colonne", () => {
  it.each([
    [
      "changer la personne d'un membre",
      "UPDATE memberships SET user_id = user_id",
    ],
    [
      "sortir un suivi de la facturation",
      "UPDATE followups SET is_test = true",
    ],
    [
      "changer le cabinet d'un suivi",
      "UPDATE followups SET animal_id = animal_id",
    ],
    ["changer l'e-mail d'une personne", "UPDATE users SET email = email"],
    ["désactiver une personne", "UPDATE users SET disabled_at = now()"],
    [
      "changer le rôle d'une invitation",
      "UPDATE invitations SET role = 'admin_vet'",
    ],
    [
      "changer le jeton d'une invitation",
      "UPDATE invitations SET token_hash = token_hash",
    ],
    [
      "déplacer un partage",
      "UPDATE followup_shares SET membership_id = membership_id",
    ],
  ])("l'application ne peut pas %s", async (_label, statement) => {
    expect(
      await asApp(app, SEED.tilleuls, (client) =>
        errorCode(client.query(statement)),
      ),
    ).toBe("42501");
  });

  it("les colonnes utiles restent modifiables", async () => {
    expect(
      await asApp(app, SEED.tilleuls, (client) =>
        errorCode(
          client.query(
            "UPDATE followups SET is_private = is_private, triage = triage, status = status",
          ),
        ),
      ),
    ).toBeUndefined();
    expect(
      await asApp(app, SEED.tilleuls, (client) =>
        errorCode(
          client.query("UPDATE memberships SET alert_phone = alert_phone"),
        ),
      ),
    ).toBeUndefined();
  });
});

describe("identité figée, même pour le propriétaire", () => {
  it("un membre reste la même personne", async () => {
    const { id, other } = await one<{ id: string; other: string }>(
      `SELECT m.id, (SELECT u.id FROM users u WHERE u.id <> m.user_id LIMIT 1) AS other
       FROM memberships m WHERE m.organization_id = $1 LIMIT 1`,
      [SEED.tilleuls],
    );
    expect(
      await asOwner(SEED.tilleuls, (client) =>
        errorCode(
          client.query("UPDATE memberships SET user_id = $2 WHERE id = $1", [
            id,
            other,
          ]),
        ),
      ),
    ).toBe("23514");
  });

  it("un suivi lancé ne devient pas un suivi test ; un brouillon, si", async () => {
    const launched = await one<{
      id: string;
      animal_id: string;
      responsible_membership_id: string;
    }>(
      `SELECT id, animal_id, responsible_membership_id FROM followups
       WHERE organization_id = $1 AND status <> 'draft' LIMIT 1`,
      [SEED.tilleuls],
    );
    const toggle = "UPDATE followups SET is_test = NOT is_test WHERE id = $1";
    expect(
      await asOwner(SEED.tilleuls, (client) =>
        errorCode(client.query(toggle, [launched.id])),
      ),
    ).toBe("23514");
    expect(
      await asOwner(SEED.tilleuls, async (client) => {
        const { rows } = await client.query(
          `INSERT INTO followups (organization_id, animal_id, responsible_membership_id,
             procedure, procedure_at)
           VALUES ($1, $2, $3, 'Brouillon fictif', now()) RETURNING id`,
          [
            SEED.tilleuls,
            launched.animal_id,
            launched.responsible_membership_id,
          ],
        );
        return errorCode(
          client.query(toggle, [(rows[0] as { id: string }).id]),
        );
      }),
    ).toBeUndefined();
  });
});

describe("journaux en ajout seul, même pour le propriétaire", () => {
  it.each([
    ["supprimer le journal d'activité", "DELETE FROM audit_events"],
    ["vider le journal d'activité", "TRUNCATE audit_events"],
    ["vider le journal de connexion", "TRUNCATE login_events"],
  ])("le propriétaire ne peut pas %s", async (_label, statement) => {
    expect(
      await asOwner(SEED.tilleuls, (client) =>
        errorCode(client.query(statement)),
      ),
    ).toBe("42501");
  });

  it("une connexion de moins de 12 mois ne s'efface pas, même hors de la purge", async () => {
    const code = await (async () => {
      const client = await admin.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          "INSERT INTO login_events (organization_id, kind) VALUES ($1, 'logout')",
          [SEED.tilleuls],
        );
        return await errorCode(
          client.query(
            "DELETE FROM login_events WHERE occurred_at > now() - interval '1 minute'",
          ),
        );
      } finally {
        await client.query("ROLLBACK");
        client.release();
      }
    })();
    expect(code).toBe("42501");
  });
});

describe("au moins un administrateur actif, même en concurrence", () => {
  it("deux administrateurs qui se retirent en même temps : un seul y parvient", async () => {
    const org = randomUUID();
    const tag = org.slice(0, 8);
    const [first, second] = await createOrganization(
      appDb,
      org,
      "Clinique d'essai des administrateurs",
      [
        {
          email: `adm1-${tag}@essai.test`,
          displayName: "Dr Une",
          role: "admin_vet",
        },
        {
          email: `adm2-${tag}@essai.test`,
          displayName: "Dr Deux",
          role: "admin_vet",
        },
      ],
    );
    if (!first || !second) throw new Error("cabinet");
    const clients = [
      new Client(inject("appUrl")),
      new Client(inject("appUrl")),
    ];
    try {
      await Promise.all(clients.map((client) => client.connect()));
      for (const client of clients) {
        await client.query("BEGIN");
        await client.query(
          "SELECT set_config('app.organization_id', $1, true)",
          [org],
        );
      }
      const [a, b] = clients as [Client, Client];
      await a.query("UPDATE memberships SET role = 'vet' WHERE id = $1", [
        first,
      ]);
      // La seconde attend la première : elle voit alors qu'il ne resterait personne.
      const blocked = b
        .query("UPDATE memberships SET role = 'vet' WHERE id = $1", [second])
        .then(
          () => null,
          (error: { code?: string; constraint?: string }) => error,
        );
      await a.query("COMMIT");
      const error = await blocked;
      expect(error).toMatchObject({
        code: "23514",
        constraint: "memberships_keep_one_admin",
      });
      await b.query("ROLLBACK");
    } finally {
      await Promise.all(clients.map((client) => client.end()));
    }
    const { rows } = await admin.query(
      "SELECT count(*)::int AS n FROM memberships WHERE organization_id = $1 AND role = 'admin_vet'",
      [org],
    );
    expect(rows[0]).toEqual({ n: 1 });
  });
});

describe("fonctions SECURITY DEFINER", () => {
  it("toutes ont pg_temp en dernier dans leur search_path", async () => {
    const { rows } = await admin.query(`
      SELECT p.oid::regprocedure::text AS fn, array_to_string(p.proconfig, ' ') AS config
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE p.prosecdef AND n.nspname NOT IN ('pg_catalog', 'information_schema')`);
    expect(rows.length).toBeGreaterThan(30);
    for (const row of rows as { fn: string; config: string }[])
      expect(row.config, row.fn).toMatch(/^search_path=.*, pg_temp$/);
  });
});

describe("migrations", () => {
  it("deux exécutions simultanées s'attendent (verrou consultatif)", async () => {
    const holder = new Client(inject("migratorUrl"));
    const runner = new Client(inject("migratorUrl"));
    await Promise.all([holder.connect(), runner.connect()]);
    try {
      await holder.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
      let done = false;
      const run = migrateUp(
        runner,
        await loadMigrations(path.join(process.cwd(), "db/migrations")),
      ).then((applied) => {
        done = true;
        return applied;
      });
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(done).toBe(false);
      await holder.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]);
      expect(await run).toEqual([]);
    } finally {
      await Promise.all([holder.end(), runner.end()]);
    }
  });
});
