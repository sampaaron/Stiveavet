import { sql } from "drizzle-orm";

import type { EmailSender } from "@/adapters/email/types";
import {
  createToken,
  isWellFormedToken,
  rateLimitBucket,
  tokenHash,
} from "@/domains/auth/tokens";
import type { Locale } from "@/i18n/locales";
import { isLocale } from "@/i18n/locales";
import { pathFor } from "@/i18n/routes";
import { withSafeDbErrors } from "@/server/db/errors";
import type { Database } from "@/server/db/tenant";

import { demoEmail, isDemoStep } from "./emails";
import type { DemoStep } from "./emails";
import type { DemoRequest } from "./validators";

/** Demandes de démo par adresse IP : [nombre maximal, fenêtre en minutes]. */
const DEMO_RATE_LIMIT = [10, 60] as const;

export type DemoAccess = { locale: Locale; cabinetName: string };

type DueEmail = {
  lead_id: string;
  email: string;
  locale: string;
  step: number;
};

async function rows<T>(db: Database, query: ReturnType<typeof sql>) {
  const result = await db.execute(query);
  return result.rows as T[];
}

/**
 * Démo du site public et séquence d'e-mails. Tout passe par les fonctions du schéma
 * `marketing` (migration 0007) : le rôle applicatif n'a aucun accès direct aux prospects.
 */
export function demoService(deps: {
  db: Database;
  email: EmailSender;
  appUrl: string;
  /** Envoi après la réponse (`after()` de Next) : sa durée ne révèle rien de l'adresse. */
  defer?: (task: () => Promise<void>) => Promise<void>;
}) {
  const { db, email, appUrl, defer = (task) => task() } = deps;
  const url = (path: string) => new URL(path, appUrl).toString();

  /** Réserve, envoie puis marque l'étape ; un échec d'envoi libère la réservation. */
  async function send(
    lead: { id: string; email: string; locale: Locale },
    step: DemoStep,
    accessUrl?: string,
  ): Promise<boolean> {
    const unsubscribeToken = createToken();
    const [reserved] = await rows<{ ok: boolean }>(
      db,
      sql`SELECT marketing.reserve_demo_email(${lead.id}, ${step}::smallint, ${tokenHash(unsubscribeToken)}) AS ok`,
    );
    if (reserved?.ok !== true) return false;
    try {
      await email.send(
        demoEmail(lead.email, step, {
          locale: lead.locale,
          appUrl,
          accessUrl,
          unsubscribeUrl: url(
            `${pathFor("unsubscribe", lead.locale)}?jeton=${unsubscribeToken}`,
          ),
          oneClickUnsubscribeUrl: url(
            `/api/desinscription?jeton=${unsubscribeToken}`,
          ),
        }),
      );
    } catch {
      await db.execute(
        sql`SELECT marketing.release_demo_email(${lead.id}, ${step}::smallint)`,
      );
      return false;
    }
    await db.execute(
      sql`SELECT marketing.mark_demo_email_sent(${lead.id}, ${step}::smallint)`,
    );
    return true;
  }

  return withSafeDbErrors({
    /**
     * Enregistre la demande et ouvre la démo dans ce navigateur. Le premier e-mail part après
     * la réponse, avec un lien qui n'est remis qu'à l'adresse : la suite de la séquence attend
     * un clic sur ce lien (ADR 0036). Une nouvelle demande avec la même adresse renouvelle
     * l'accès sans renvoyer d'e-mail. La réponse est la même que l'adresse soit connue ou non.
     */
    async capture(
      input: DemoRequest,
      ip: string | null,
    ): Promise<
      { status: "rate_limited" } | { status: "captured"; accessToken: string }
    > {
      if (ip) {
        const [max, windowMinutes] = DEMO_RATE_LIMIT;
        const [hit] = await rows<{ allowed: boolean }>(
          db,
          sql`SELECT auth.hit_rate_limit(${rateLimitBucket("demoPerIp", ip)}, ${`${windowMinutes} minutes`}::interval, ${max}) AS allowed`,
        );
        if (hit?.allowed !== true) return { status: "rate_limited" };
      }

      const accessToken = createToken();
      const linkToken = createToken();
      const [lead] = await rows<{ lead_id: string; created: boolean }>(
        db,
        sql`SELECT * FROM marketing.capture_demo_lead(${input.email}, ${input.cabinetName}, ${input.vetCount}::smallint, ${input.locale}, ${tokenHash(accessToken)}, ${tokenHash(linkToken)})`,
      );
      if (!lead) throw new Error("Demande de démo non enregistrée");
      if (lead.created)
        await defer(async () => {
          // Un échec d'envoi libère l'étape : le prochain passage la renvoie.
          await send(
            { id: lead.lead_id, email: input.email, locale: input.locale },
            1,
            url(`/demo/acces/${linkToken}`),
          );
        });
      return { status: "captured", accessToken };
    },

    /** Démo ouverte pour ce jeton (14 jours après la dernière demande), sinon null. */
    async access(token: string | undefined): Promise<DemoAccess | null> {
      if (!isWellFormedToken(token)) return null;
      const [row] = await rows<{ locale: string; cabinet_name: string }>(
        db,
        sql`SELECT * FROM marketing.demo_access(${tokenHash(token)})`,
      );
      if (!row || !isLocale(row.locale)) return null;
      return { locale: row.locale, cabinetName: row.cabinet_name };
    },

    /** Lien du premier e-mail : confirme l'adresse et ouvre la démo, sinon null. */
    async openLink(token: string | undefined): Promise<DemoAccess | null> {
      if (!isWellFormedToken(token)) return null;
      const [row] = await rows<{ locale: string; cabinet_name: string }>(
        db,
        sql`SELECT * FROM marketing.open_demo_link(${tokenHash(token)})`,
      );
      if (!row || !isLocale(row.locale)) return null;
      return { locale: row.locale, cabinetName: row.cabinet_name };
    },

    /** Désinscription par le lien d'un e-mail ; idempotente. */
    async unsubscribe(token: string | undefined): Promise<boolean> {
      if (!isWellFormedToken(token)) return false;
      const [row] = await rows<{ ok: boolean }>(
        db,
        sql`SELECT marketing.unsubscribe(${tokenHash(token)}) AS ok`,
      );
      return row?.ok === true;
    },

    /**
     * Envoie les e-mails dus de la séquence (à lancer régulièrement ; aucune tâche de fond en
     * phase 1) et purge les prospects de plus d'un an.
     */
    async dispatch(
      limit = 50,
    ): Promise<{ sent: number; failed: number; purged: number }> {
      const due = await rows<DueEmail>(
        db,
        sql`SELECT * FROM marketing.due_demo_emails(${limit})`,
      );
      let sent = 0;
      let failed = 0;
      for (const row of due) {
        if (!isLocale(row.locale) || !isDemoStep(row.step)) continue;
        const ok = await send(
          { id: row.lead_id, email: row.email, locale: row.locale },
          row.step,
        );
        if (ok) sent += 1;
        else failed += 1;
      }
      const [purge] = await rows<{ purged: number }>(
        db,
        sql`SELECT marketing.purge_demo_leads() AS purged`,
      );
      return { sent, failed, purged: purge?.purged ?? 0 };
    },
  });
}

export type DemoService = ReturnType<typeof demoService>;
