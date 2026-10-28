import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { z } from "zod";

import { wakeChannel } from "@/adapters/queue/config";
import { parseConfig } from "@/server/config";
import { serverEnv } from "@/server/env";

import * as schema from "./schema";
import { onTenantCommitWake } from "./tenant";
import type { Database } from "./tenant";

let database: Database | undefined;

/**
 * Délais de la base pour l'application web : une requête trop longue, ou une transaction
 * oubliée ouverte, est coupée par PostgreSQL au lieu de garder une connexion du pool.
 */
const poolConfig = z.object({
  DATABASE_STATEMENT_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(300_000)
    .default(30_000),
  DATABASE_IDLE_TRANSACTION_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(600_000)
    .default(60_000),
});

/**
 * Connexion du rôle applicatif stivea_app (ni propriétaire, ni BYPASSRLS).
 * À n'utiliser qu'à travers `withTenant` ; aucune requête métier hors transaction.
 */
export function appDatabase(): Database {
  if (!database) {
    const url = serverEnv().DATABASE_URL;
    if (!url) throw new Error("Configuration invalide : DATABASE_URL");
    const timeouts = parseConfig(poolConfig, process.env);
    database = drizzle(
      new Pool({
        connectionString: url,
        max: 10,
        statement_timeout: timeouts.DATABASE_STATEMENT_TIMEOUT_MS,
        idle_in_transaction_session_timeout:
          timeouts.DATABASE_IDLE_TRANSACTION_TIMEOUT_MS,
      }),
      { schema },
    );
    // Réveil du worker après chaque transaction qui inscrit une tâche (ADR 0028). Un échec
    // n'a pas d'effet : le worker reprend la tâche à son passage suivant.
    const wake = wakeChannel(process.env);
    onTenantCommitWake(() => {
      wake.notify().catch(() => console.warn("Réveil du worker impossible."));
    });
  }
  return database;
}
