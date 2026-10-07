import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { serverEnv } from "@/server/env";

import * as schema from "./schema";
import type { Database } from "./tenant";

let database: Database | undefined;

/**
 * Connexion du rôle applicatif stivea_app (ni propriétaire, ni BYPASSRLS).
 * À n'utiliser qu'à travers `withTenant` ; aucune requête métier hors transaction.
 */
export function appDatabase(): Database {
  if (!database) {
    const url = serverEnv().DATABASE_URL;
    if (!url) throw new Error("Configuration invalide : DATABASE_URL");
    database = drizzle(new Pool({ connectionString: url, max: 10 }), {
      schema,
    });
  }
  return database;
}
