/**
 * Envoie les e-mails dus de la séquence de démo (cinq e-mails sur deux semaines) vers Mailpit.
 * Aucune tâche de fond n'existe en phase 1 : on lance ce script à la main ou par une tâche
 * planifiée locale.   pnpm demo:emails
 */
import { drizzle } from "drizzle-orm/node-postgres";
import nodemailer from "nodemailer";
import { Pool } from "pg";

import { demoService } from "../src/domains/demo/service";
import * as schema from "../src/server/db/schema";

// Aucun prestataire réel : local uniquement, vers Mailpit (ADR 0004 et 0012).
if (process.env.APP_ENV !== "local") {
  console.error(
    "La séquence de démo ne s'envoie qu'avec APP_ENV=local (Mailpit).",
  );
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL manquante");
  process.exit(1);
}

const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? "localhost",
  port: Number(process.env.SMTP_PORT ?? 1025),
  secure: false,
  ignoreTLS: true,
});

const pool = new Pool({ connectionString: url });
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
    appUrl: process.env.APP_URL ?? "http://localhost:3000",
  }).dispatch();
  // Uniquement des nombres : jamais d'adresse e-mail dans la sortie.
  console.warn(
    `Séquence de démo : ${result.sent} envoyé(s), ${result.failed} en échec, ${result.purged} prospect(s) supprimé(s).`,
  );
} finally {
  await pool.end();
  transport.close();
}
