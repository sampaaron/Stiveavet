/**
 * Worker de la file de tâches (ADR 0014) : publie l'outbox, prend les tâches dues, les
 * exécute dans la transaction de leur cabinet. Processus séparé de l'application.
 *   pnpm worker            (boucle, arrêt propre sur SIGINT / SIGTERM)
 *   pnpm worker --once     (un seul passage, pour les essais)
 * Les journaux ne contiennent que des compteurs : jamais de contenu, numéro ou e-mail.
 */
import { hostname } from "node:os";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { JOB_HANDLERS, OUTBOX_ROUTES } from "../src/domains/taches/registry";
import { createWorker } from "../src/domains/taches/worker";
import * as schema from "../src/server/db/schema";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Configuration invalide : DATABASE_URL");
  process.exit(1);
}
const intervalMs = Number(process.env.WORKER_INTERVAL_MS ?? 5_000);
const workerId = `worker-${
  hostname()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 40) || "local"
}-${process.pid}`;

const pool = new Pool({ connectionString: url, max: 4 });
const worker = createWorker({
  db: drizzle(pool, { schema }),
  workerId,
  handlers: JOB_HANDLERS,
  routes: OUTBOX_ROUTES,
});

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    stopping = true;
  });

async function pass() {
  try {
    const result = await worker.runOnce();
    if (Object.values(result).some((value) => value > 0))
      console.warn(
        `Passage : ${result.published} événement(s) publié(s), ${result.succeeded} réussie(s), ${result.retried} reprogrammée(s), ${result.dead} en échec, ${result.lost} reprise(s) ailleurs.`,
      );
  } catch (error) {
    // Nom de l'erreur seulement : son message peut citer une donnée.
    console.error(
      `Passage interrompu (${error instanceof Error ? error.name : "erreur"}).`,
    );
  }
}

console.warn(`Worker ${workerId} démarré.`);
if (process.argv.includes("--once")) await pass();
else
  while (!stopping) {
    await pass();
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
await pool.end();
console.warn("Worker arrêté.");
