import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import type { Client } from "pg";

/**
 * Migrations SQL écrites à la main, versionnées dans `db/migrations` :
 * `NNNN_nom.up.sql` et son inverse obligatoire `NNNN_nom.down.sql`.
 * Chaque migration s'applique dans une transaction ; une migration déjà appliquée
 * dont le fichier a changé bloque tout (somme de contrôle).
 */
export type Migration = {
  version: string;
  up: string;
  down: string;
  checksum: string;
};

const FILE_PATTERN = /^(\d{4}_[a-z0-9_]+)\.(up|down)\.sql$/;

export async function loadMigrations(directory: string): Promise<Migration[]> {
  const files = (await readdir(directory))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const byVersion = new Map<string, { up?: string; down?: string }>();

  for (const file of files) {
    const match = FILE_PATTERN.exec(file);
    if (!match?.[1] || !match[2])
      throw new Error(`Nom de migration invalide : ${file}`);
    const entry = byVersion.get(match[1]) ?? {};
    entry[match[2] as "up" | "down"] = await readFile(
      path.join(directory, file),
      "utf8",
    );
    byVersion.set(match[1], entry);
  }

  return [...byVersion.entries()].map(([version, { up, down }]) => {
    if (!up || !down)
      throw new Error(
        `La migration ${version} doit avoir un fichier up et un fichier down`,
      );
    return {
      version,
      up,
      down,
      checksum: createHash("sha256").update(up).digest("hex"),
    };
  });
}

async function ensureLedger(client: Client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      version text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
}

async function appliedVersions(client: Client): Promise<Map<string, string>> {
  const { rows } = await client.query<{ version: string; checksum: string }>(
    "SELECT version, checksum FROM public.schema_migrations ORDER BY version",
  );
  return new Map(rows.map((row) => [row.version, row.checksum]));
}

async function inTransaction(client: Client, run: () => Promise<void>) {
  await client.query("BEGIN");
  try {
    await run();
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

/** Applique toutes les migrations en attente, dans l'ordre. Retourne les versions appliquées. */
export async function migrateUp(
  client: Client,
  migrations: Migration[],
): Promise<string[]> {
  await ensureLedger(client);
  const applied = await appliedVersions(client);
  const done: string[] = [];

  for (const migration of migrations) {
    const knownChecksum = applied.get(migration.version);
    if (knownChecksum) {
      if (knownChecksum !== migration.checksum) {
        throw new Error(
          `La migration ${migration.version} a été modifiée après application`,
        );
      }
      continue;
    }
    await inTransaction(client, async () => {
      await client.query(migration.up);
      await client.query(
        "INSERT INTO public.schema_migrations (version, checksum) VALUES ($1, $2)",
        [migration.version, migration.checksum],
      );
    });
    done.push(migration.version);
  }
  return done;
}

/** Annule la dernière migration appliquée. Retourne sa version, ou null s'il n'y en a aucune. */
export async function migrateDown(
  client: Client,
  migrations: Migration[],
): Promise<string | null> {
  await ensureLedger(client);
  const applied = [...(await appliedVersions(client)).keys()];
  const last = applied.at(-1);
  if (!last) return null;

  const migration = migrations.find((candidate) => candidate.version === last);
  if (!migration)
    throw new Error(`Fichier introuvable pour la migration appliquée ${last}`);

  await inTransaction(client, async () => {
    await client.query(migration.down);
    await client.query(
      "DELETE FROM public.schema_migrations WHERE version = $1",
      [last],
    );
  });
  return last;
}
