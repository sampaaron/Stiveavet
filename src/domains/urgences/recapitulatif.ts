import { and, eq, gte, inArray, isNull, ne, or, gt, sql } from "drizzle-orm";
import { z } from "zod";

import { escapeHtml } from "@/adapters/email/html";
import type { EmailMessage, EmailSender } from "@/adapters/email/types";
import { VET_ROLES } from "@/domains/equipe/permissions";
import {
  parisDate,
  parisDayIndex,
  parisLocalToDate,
} from "@/domains/heure-paris";
import { followupAccess } from "@/domains/suivis/policies";
import { JobError } from "@/domains/taches/kinds";
import { enqueue } from "@/domains/taches/queue";
import type { JobHandler } from "@/domains/taches/worker";
import { nombre } from "@/i18n/pluriel";
import {
  acknowledgements,
  alerts,
  followupShares,
  followups,
  memberships,
  organizations,
} from "@/server/db/schema";
import type { Database, TenantTransaction } from "@/server/db/tenant";

import { alertTeam } from "./service";
import type { TeamMember } from "./service";

/**
 * Récapitulatif des alertes aux vétérinaires, à 12 h et à 18 h (ADR 0049) : ce qui reste
 * ouvert sur les dossiers que chacun lit en clinique, ce que l'équipe a en main et ce qu'elle
 * a clos depuis le dernier point. Des nombres et un lien seulement : ni animal, ni contenu,
 * ni numéro dans l'e-mail. Rien à signaler : aucun e-mail.
 */

export const ALERT_RECAP_JOB = "alert.recap";
const RECAP_MAIL_JOB = "alert.recap_mail";

const slot = z.enum(["midday", "evening"]);
type Slot = z.infer<typeof slot>;
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const recapPayload = z.object({ slot });
const mailPayload = z.object({ slot, day, membershipId: z.uuid() });

/** Premier passage du worker dans un créneau : une tâche `alert.recap` par cabinet. */
export async function planAlertRecaps(db: Database): Promise<number> {
  const result = await db.execute<{ planned: number }>(
    sql`SELECT jobs.plan_alert_recaps() AS planned`,
  );
  return Number(result.rows[0]?.planned ?? 0);
}

/** Début de la période couverte : le point précédent (18 h la veille, ou 12 h). */
function periodStart(recap: Slot, date: string): Date {
  if (recap === "evening")
    return parisLocalToDate(`${date}T12:00`) ?? new Date(0);
  const index = parisDayIndex(new Date(`${date}T12:00:00Z`)) - 1;
  const yesterday = new Date(index * 86_400_000).toISOString().slice(0, 10);
  return parisLocalToDate(`${yesterday}T18:00`) ?? new Date(0);
}

export type AlertRecap = {
  urgent: number;
  watch: number;
  withTeam: number;
  closedByTeam: number;
};

/** Décomptes d'un vétérinaire, sur les dossiers qu'il lit en clinique. */
export async function recapFor(
  tx: TenantTransaction,
  member: TeamMember,
  team: readonly TeamMember[],
  since: Date,
): Promise<AlertRecap> {
  const rows = await tx
    .select({
      id: alerts.id,
      followupId: alerts.followupId,
      level: alerts.level,
      status: alerts.status,
      forwardedAt: alerts.forwardedAt,
      resolvedBy: alerts.resolvedByMembershipId,
      responsibleMembershipId: followups.responsibleMembershipId,
      isPrivate: followups.isPrivate,
    })
    .from(alerts)
    .innerJoin(followups, eq(followups.id, alerts.followupId))
    .where(
      or(
        ne(alerts.status, "resolved"),
        and(eq(alerts.level, "watch"), gte(alerts.resolvedAt, since)),
      ),
    );
  if (!rows.length)
    return { urgent: 0, watch: 0, withTeam: 0, closedByTeam: 0 };
  const now = new Date();
  const shares = await tx
    .select({
      followupId: followupShares.followupId,
      membershipId: followupShares.membershipId,
    })
    .from(followupShares)
    .where(
      and(
        inArray(
          followupShares.followupId,
          rows.map((row) => row.followupId),
        ),
        isNull(followupShares.revokedAt),
        or(isNull(followupShares.expiresAt), gt(followupShares.expiresAt, now)),
      ),
    );
  const vetAcks = new Set(
    (
      await tx
        .select({ alertId: acknowledgements.alertId })
        .from(acknowledgements)
        .innerJoin(
          memberships,
          eq(memberships.id, acknowledgements.membershipId),
        )
        .where(
          and(
            inArray(
              acknowledgements.alertId,
              rows.map((row) => row.id),
            ),
            inArray(memberships.role, [...VET_ROLES]),
          ),
        )
    ).map((row) => row.alertId),
  );
  const roles = new Map(team.map((entry) => [entry.id, entry.role]));
  const recap: AlertRecap = {
    urgent: 0,
    watch: 0,
    withTeam: 0,
    closedByTeam: 0,
  };
  for (const row of rows) {
    const facts = {
      responsibleMembershipId: row.responsibleMembershipId,
      isPrivate: row.isPrivate,
      sharedWith: shares
        .filter((share) => share.followupId === row.followupId)
        .map((share) => share.membershipId),
    };
    if (
      followupAccess(
        { membershipId: member.id, permissions: member.permissions },
        facts,
      ) !== "clinical"
    )
      continue;
    if (row.status === "resolved") {
      const role = row.resolvedBy ? roles.get(row.resolvedBy) : undefined;
      if (role && !VET_ROLES.has(role)) recap.closedByTeam += 1;
      continue;
    }
    if (row.level === "urgent") recap.urgent += 1;
    else if (
      alertTeam.isHeldByTeam(
        row,
        vetAcks.has(row.id),
        alertTeam.watchHandlers(team, facts).length,
      )
    )
      recap.withTeam += 1;
    else recap.watch += 1;
  }
  return recap;
}

function recapEmail(
  to: string,
  details: {
    displayName: string;
    organizationName: string;
    slot: Slot;
    recap: AlertRecap;
    link: string;
  },
): EmailMessage {
  const { recap } = details;
  const hour = details.slot === "midday" ? "12 h" : "18 h";
  const since = details.slot === "midday" ? "hier 18 h" : "12 h";
  const lines = [
    recap.urgent
      ? `${nombre(recap.urgent, "urgence en cours", "urgences en cours")}`
      : null,
    recap.watch
      ? `${nombre(recap.watch, "alerte « à surveiller » pour vous", "alertes « à surveiller » pour vous")}`
      : null,
    recap.withTeam
      ? `${nombre(recap.withTeam, "alerte « à surveiller » prise", "alertes « à surveiller » prises")} en charge par l'équipe`
      : null,
    recap.closedByTeam
      ? `${nombre(recap.closedByTeam, "alerte « à surveiller » close", "alertes « à surveiller » closes")} par l'équipe depuis ${since}`
      : null,
  ].filter((line): line is string => line !== null);
  const intro = [
    `Bonjour ${details.displayName},`,
    `Voici le point de ${hour} sur les alertes de ${details.organizationName} :`,
  ];
  const outro = [
    "Ouvrez Stivea Vet pour les lire et y répondre. Aucun détail médical n'est envoyé par e-mail.",
    "L'équipe Stivea Vet",
  ];
  return {
    to,
    subject: `Stivea Vet : le point de ${hour} sur les alertes`,
    text: [
      ...intro,
      lines.map((line) => `- ${line}`).join("\n"),
      details.link,
      ...outro,
    ].join("\n\n"),
    html: [
      ...intro.map((line) => `<p>${escapeHtml(line)}</p>`),
      `<ul>${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`,
      `<p><a href="${escapeHtml(details.link)}">${escapeHtml(details.link)}</a></p>`,
      ...outro.map((line) => `<p>${escapeHtml(line)}</p>`),
    ].join(""),
  };
}

export function alertRecapHandlers(deps: {
  email: EmailSender;
  appUrl: string;
  clock?: () => Date;
}): Record<string, JobHandler> {
  const { email, appUrl, clock = () => new Date() } = deps;
  return {
    /** Une tâche par vétérinaire actif : un e-mail qui échoue ne renvoie pas les autres. */
    [ALERT_RECAP_JOB]: async ({ tx, job }) => {
      const parsed = recapPayload.safeParse(job.payload);
      if (!parsed.success) throw new JobError("invalid_payload");
      const date = parisDate(clock());
      const vets = (await alertTeam.activeTeam(tx)).filter((member) =>
        VET_ROLES.has(member.role),
      );
      for (const vet of vets)
        await enqueue(tx, {
          organizationId: job.organizationId,
          kind: RECAP_MAIL_JOB,
          idempotencyKey: `alert:recap:${date}:${parsed.data.slot}:${vet.id}`,
          runAt: clock(),
          payload: { slot: parsed.data.slot, day: date, membershipId: vet.id },
        });
    },
    [RECAP_MAIL_JOB]: async ({ tx, job }) => {
      const parsed = mailPayload.safeParse(job.payload);
      if (!parsed.success) throw new JobError("invalid_payload");
      const team = await alertTeam.activeTeam(tx);
      const vet = team.find((member) => member.id === parsed.data.membershipId);
      // Accès retiré entre-temps : plus rien à envoyer.
      if (!vet || !VET_ROLES.has(vet.role)) return;
      const recap = await recapFor(
        tx,
        vet,
        team,
        periodStart(parsed.data.slot, parsed.data.day),
      );
      if (
        !recap.urgent &&
        !recap.watch &&
        !recap.withTeam &&
        !recap.closedByTeam
      )
        return;
      const [organization] = await tx
        .select({ name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, job.organizationId));
      if (!organization) return;
      try {
        await email.send(
          recapEmail(vet.email, {
            displayName: vet.name,
            organizationName: organization.name,
            slot: parsed.data.slot,
            recap,
            link: new URL("/app/alertes", appUrl).toString(),
          }),
        );
      } catch {
        throw new JobError("provider_unavailable");
      }
    },
  };
}
