import { sql } from "drizzle-orm";

import type { Actor } from "@/domains/equipe/actor";
import { tenantRunner } from "@/server/db/tenant";
import type { Database } from "@/server/db/tenant";

/**
 * Activité du cabinet pour le tableau de bord (cahier des charges §12) : des totaux, jamais
 * de détail d'un suivi, si bien qu'ils ne dépendent pas des droits sur chaque dossier. Les
 * suivis test de l'installation ne comptent pas.
 */

const ACTIVITY_DAYS = 30;
const CHART_DAYS = 14;

export type ActivityStats = {
  ongoing: number;
  launched: number;
  ended: number;
  ownerMessages: number;
  outboundMessages: number;
  /** Suivis lancés sur la période dont le propriétaire a répondu au moins une fois. */
  response: { launched: number; answered: number };
  alerts: { created: number; open: number; unacknowledged: number };
  /** Délai médian avant le premier accusé de réception, en minutes (null : aucun). */
  medianAckMinutes: number | null;
  /** Messages par jour (heure de Paris), du plus ancien au plus récent. */
  daily: { day: string; inbound: number; outbound: number }[];
  next: { drafts: number; controlsThisWeek: number; consentPending: number };
};

const int = (value: unknown) => Number(value ?? 0);

/** Jour de Paris (AAAA-MM-JJ) d'un instant. */
function parisDay(instant: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

export function statsService(db: Database) {
  const run = tenantRunner(db);

  return {
    async activity(actor: Actor, now = new Date()): Promise<ActivityStats> {
      const since = new Date(now.getTime() - ACTIVITY_DAYS * 86_400_000);
      const week = new Date(now.getTime() + 7 * 86_400_000);
      return run(actor, async (tx) => {
        const followupRows = await tx.execute<Record<string, unknown>>(sql`
          SELECT
            count(*) FILTER (WHERE f.status IN ('active', 'paused', 'human_takeover')) AS ongoing,
            count(*) FILTER (WHERE f.started_at >= ${since}) AS launched,
            count(*) FILTER (WHERE f.ended_at >= ${since}) AS ended,
            count(*) FILTER (WHERE f.status = 'draft') AS drafts,
            count(*) FILTER (
              WHERE f.status IN ('active', 'paused', 'human_takeover')
                AND f.control_appointment_at >= ${now} AND f.control_appointment_at < ${week}
            ) AS controls,
            count(*) FILTER (
              WHERE f.started_at >= ${since}
                AND EXISTS (SELECT 1 FROM messages m WHERE m.followup_id = f.id AND m.author = 'owner')
            ) AS answered,
            count(*) FILTER (
              WHERE f.status = 'active' AND EXISTS (
                SELECT 1 FROM followup_contacts fc
                JOIN LATERAL (
                  SELECT c.state FROM consents c WHERE c.followup_contact_id = fc.id
                  ORDER BY c.recorded_at DESC LIMIT 1
                ) last ON true
                WHERE fc.followup_id = f.id AND fc.role = 'primary' AND last.state = 'requested'
              )
            ) AS consent_pending
          FROM followups f
          WHERE NOT f.is_test`);
        const messageRows = await tx.execute<Record<string, unknown>>(sql`
          SELECT
            (m.occurred_at AT TIME ZONE 'Europe/Paris')::date::text AS day,
            count(*) FILTER (WHERE m.author = 'owner') AS inbound,
            count(*) FILTER (WHERE m.direction = 'outbound') AS outbound
          FROM messages m
          JOIN followups f ON f.id = m.followup_id
          WHERE NOT f.is_test AND m.occurred_at >= ${since}
          GROUP BY 1`);
        const alertRows = await tx.execute<Record<string, unknown>>(sql`
          SELECT
            count(*) FILTER (WHERE a.created_at >= ${since}) AS created,
            count(*) FILTER (WHERE a.resolved_at IS NULL) AS open,
            count(*) FILTER (
              WHERE a.resolved_at IS NULL
                AND NOT EXISTS (SELECT 1 FROM acknowledgements k WHERE k.alert_id = a.id)
            ) AS unacknowledged,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM first_ack.at - a.created_at) / 60)
              FILTER (WHERE a.created_at >= ${since} AND first_ack.at IS NOT NULL) AS median_ack
          FROM alerts a
          JOIN followups f ON f.id = a.followup_id
          LEFT JOIN LATERAL (
            SELECT min(k.acknowledged_at) AS at FROM acknowledgements k WHERE k.alert_id = a.id
          ) first_ack ON true
          WHERE NOT f.is_test`);

        const counts = followupRows.rows[0] ?? {};
        const alerts = alertRows.rows[0] ?? {};
        const byDay = new Map(
          messageRows.rows.map((row) => [String(row.day), row]),
        );
        const daily: ActivityStats["daily"] = [];
        for (let offset = CHART_DAYS - 1; offset >= 0; offset -= 1) {
          const day = parisDay(new Date(now.getTime() - offset * 86_400_000));
          const row = byDay.get(day);
          daily.push({
            day,
            inbound: int(row?.inbound),
            outbound: int(row?.outbound),
          });
        }
        const median = alerts.median_ack;
        return {
          ongoing: int(counts.ongoing),
          launched: int(counts.launched),
          ended: int(counts.ended),
          ownerMessages: messageRows.rows.reduce(
            (sum, row) => sum + int(row.inbound),
            0,
          ),
          outboundMessages: messageRows.rows.reduce(
            (sum, row) => sum + int(row.outbound),
            0,
          ),
          response: {
            launched: int(counts.launched),
            answered: int(counts.answered),
          },
          alerts: {
            created: int(alerts.created),
            open: int(alerts.open),
            unacknowledged: int(alerts.unacknowledged),
          },
          medianAckMinutes:
            median === null || median === undefined
              ? null
              : Math.round(Number(median)),
          daily,
          next: {
            drafts: int(counts.drafts),
            controlsThisWeek: int(counts.controls),
            consentPending: int(counts.consent_pending),
          },
        };
      });
    },
  };
}

export type StatsService = ReturnType<typeof statsService>;
