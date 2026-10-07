/**
 * Applique ou annule les migrations avec le rôle stivea_migrator.
 *   pnpm db:migrate        applique les migrations en attente
 *   pnpm db:migrate down   annule la dernière migration
 */
import path from "node:path";

import { Client } from "pg";

import {
  loadMigrations,
  migrateDown,
  migrateUp,
} from "../src/server/db/migrations";

const url = process.env.MIGRATOR_DATABASE_URL;
if (!url) {
  console.error("MIGRATOR_DATABASE_URL manquante");
  process.exit(1);
}

const client = new Client({ connectionString: url });
await client.connect();
try {
  const migrations = await loadMigrations(
    path.join(import.meta.dirname, "migrations"),
  );
  if (process.argv[2] === "down") {
    const version = await migrateDown(client, migrations);
    console.warn(
      version ? `Annulée : ${version}` : "Aucune migration à annuler",
    );
  } else {
    const versions = await migrateUp(client, migrations);
    console.warn(
      versions.length ? `Appliquées : ${versions.join(", ")}` : "Base à jour",
    );
  }
} finally {
  await client.end();
}
