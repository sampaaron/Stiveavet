/**
 * Envoie les e-mails dus de la séquence de démo (cinq e-mails sur deux semaines) vers Mailpit.
 * Aucune tâche de fond n'existe en phase 1 : on lance ce script à la main ou par une tâche
 * planifiée locale.   pnpm demo:emails
 */
import { drizzle } from "drizzle-orm/node-postgres";
import nodemailer from "nodemailer";
import { Pool } from "pg";
import { z } from "zod";

import { demoService } from "../src/domains/demo/service";
import { parseConfig } from "../src/server/config";
import * as schema from "../src/server/db/schema";

// Aucun prestataire réel : local uniquement, vers Mailpit (ADR 0004 et 0012).
if (process.env.APP_ENV !== "local") {
  console.error(
    "La séquence de démo ne s'envoie qu'avec APP_ENV=local (Mailpit).",
  );
  process.exit(1);
}
const demoConfig = z.object({
  DATABASE_URL: z.url(),
  SMTP_HOST: z.string().min(1).default("localhost"),
  SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(1025),
  APP_URL: z.url().default("http://localhost:3000"),
});
let env: z.output<typeof demoConfig>;
try {
  env = parseConfig(demoConfig, process.env);
} catch (error) {
  // Le message ne cite que des noms de variables, jamais leurs valeurs.
  console.error(
    error instanceof Error ? error.message : "Configuration invalide",
  );
  process.exit(1);
}

const transport = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: false,
  ignoreTLS: true,
});

const pool = new Pool({ connectionString: env.DATABASE_URL });
try {
  const result = await demoService({
    db: drizzle(pool, { schema }),
    email: {
      send: async (message) => {
        await transport.sendMail({
          from: "Stivea Vet <bonjour@stivea.test>",
          ...message,
        });
      },
    },
    appUrl: env.APP_URL,
  }).dispatch();
  // Uniquement des nombres : jamais d'adresse e-mail dans la sortie.
  console.warn(
    `Séquence de démo : ${result.sent} envoyé(s), ${result.failed} en échec, ${result.purged} prospect(s) supprimé(s).`,
  );
} finally {
  await pool.end();
  transport.close();
}
