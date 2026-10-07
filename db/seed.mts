/** Remplit une base vide avec les cabinets fictifs, via le rôle applicatif (donc sous RLS). */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "../src/server/db/schema";

import { seedFictionalCabinets } from "./seed/cabinets-fictifs";

// Refus par défaut : seul un environnement explicitement local reçoit le jeu fictif.
if (process.env.APP_ENV !== "local") {
  console.error("Le jeu fictif ne s'installe qu'avec APP_ENV=local.");
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL manquante");
  process.exit(1);
}

const pool = new Pool({ connectionString: url });
try {
  await seedFictionalCabinets(drizzle(pool, { schema }));
  console.warn("Cabinets fictifs installés.");
} finally {
  await pool.end();
}
