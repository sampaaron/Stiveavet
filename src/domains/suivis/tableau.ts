import { and, asc, desc, eq, gte, inArray, lt, ne } from "drizzle-orm";

import type { DrVetoConnector } from "@/adapters/drveto/types";
import { followupActivity } from "@/domains/facturation/service";
import { INCLUDED_ACTIVE_FOLLOWUPS } from "@/domains/facturation/rules";
import type { Actor } from "@/domains/equipe/actor";
import { parisLocalToDate } from "@/domains/reglages/content";
import {
  alerts,
  animals,
  appointments,
  attachments,
  consents,
  followupContacts,
  integrationConnections,
  memberships,
  messages,
  triageEvents,
  users,
  voiceTranscripts,
} from "@/server/db/schema";
import { withTenant } from "@/server/db/tenant";
import type { Database, TenantTransaction } from "@/server/db/tenant";

import { parisDayIndex } from "./calendrier";
import type {
  FollowupClinical,
  FollowupView,
  FollowupsService,
} from "./service";

/**
 * Tableau de bord « Aujourd'hui » (cahier des charges §12, ADR 0020), lu dans la base :
 * urgences et cas à surveiller, suivis actifs avec leur dernière nouvelle, compteur de
 * capacité, agenda du jour (dr.veto, simulé, et rendez-vous pris par Stivea Vet).
 * Le détail d'un suivi n'est donné qu'avec l'accès clinique à ce suivi ; le compteur de
 * capacité est un total du cabinet, sans détail.
 */

/** Ce que dit la ligne d'un suivi sur le tableau de bord, du plus important au plus banal. */
export type DashboardSummary =
  | {
      kind: "alert";
      reason: string;
      at: Date;
      /** Dernière nouvelle du propriétaire : plus parlante que le motif du triage. */
      owner: { text: string | null; media: "photo" | "voice" | null } | null;
    }
  | { kind: "paused" }
  | { kind: "human_takeover" }
  | { kind: "consent_withdrawn" }
  | { kind: "consent_requested" }
  | { kind: "not_started" }
  | {
      kind: "owner";
      text: string;
      media: "photo" | "voice" | null;
      at: Date;
    }
  | { kind: "quiet" };

export type DashboardFollowup = {
  id: string;
  animalName: string;
  species: "dog" | "cat";
  status: FollowupClinical["status"];
  triage: FollowupClinical["triage"];
  procedure: string;
  procedureAt: Date;
  responsibleName: string;
  /** Accord du contact principal : null tant que Numa ne l'a pas demandé. */
  consent: "requested" | "given" | "withdrawn" | null;
  lastActivityAt: Date | null;
  summary: DashboardSummary;
};

export type DashboardAgendaItem = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  title: string;
  kind: "consultation" | "chirurgie" | "controle" | "urgence";
  vetName: string;
  /** Rendez-vous pris ou confirmé dans Stivea Vet (sinon lu dans l'agenda dr.veto). */
  fromStivea: boolean;
  /** Suivi lié, seulement si la personne peut ouvrir son dossier. */
  followupId: string | null;
};

export type TodayView = {
  /** Suivis visibles par la personne, au niveau de détail autorisé (vue d'organisation). */
  views: FollowupView[];
  /** Suivis en cours avec accès clinique, du plus grave au plus récent. */
  followups: DashboardFollowup[];
  activeFollowups: number;
  includedFollowups: number;
  /** null : pas de droit de lecture de l'agenda. */
  agenda: DashboardAgendaItem[] | null;
  /** Rendez-vous Stivea confirmés aujourd'hui. */
  stiveaAppointments: number;
};

const ONGOING = new Set(["active", "paused", "human_takeover"]);
const MAX_EXCERPT = 120;

const APPOINTMENT_TITLES = {
  post_op_control: "Contrôle post-opératoire",
  emergency: "Urgence",
  treatment_followup: "Suivi de traitement",
  other: "Rendez-vous",
} as const;

const APPOINTMENT_KINDS = {
  post_op_control: "controle",
  emergency: "urgence",
  treatment_followup: "consultation",
  other: "consultation",
} as const;

const DRVETO_KINDS = {
  consultation: "consultation",
  surgery: "chirurgie",
  control: "controle",
  emergency: "urgence",
} as const;

function excerpt(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= MAX_EXCERPT
    ? clean
    : `${clean.slice(0, MAX_EXCERPT - 1).trimEnd()}…`;
}

/** Bornes du jour de Paris qui contient `now`. */
export function parisDayBounds(now: Date): { start: Date; end: Date } {
  const iso = (index: number) =>
    new Date(index * 86_400_000).toISOString().slice(0, 10);
  const today = parisDayIndex(now);
  const start = parisLocalToDate(`${iso(today)}T00:00`);
  const end = parisLocalToDate(`${iso(today + 1)}T00:00`);
  if (!start || !end) throw new Error("Jour de Paris introuvable");
  return { start, end };
}

/** Faits cliniques des suivis (accès clinique déjà vérifié par l'appelant). */
async function clinicalFacts(tx: TenantTransaction, ids: string[]) {
  if (!ids.length)
    return {
      lastMessage: new Map<string, Date>(),
      lastOwner: new Map<
        string,
        { text: string; media: "photo" | "voice" | null; at: Date }
      >(),
      openAlert: new Map<string, { reason: string; at: Date }>(),
      consent: new Map<string, "requested" | "given" | "withdrawn">(),
    };

  const latest = await tx
    .selectDistinctOn([messages.followupId], {
      followupId: messages.followupId,
      at: messages.occurredAt,
    })
    .from(messages)
    .where(inArray(messages.followupId, ids))
    .orderBy(messages.followupId, desc(messages.occurredAt));

  const owner = await tx
    .selectDistinctOn([messages.followupId], {
      followupId: messages.followupId,
      id: messages.id,
      body: messages.body,
      at: messages.occurredAt,
    })
    .from(messages)
    .where(and(inArray(messages.followupId, ids), eq(messages.author, "owner")))
    .orderBy(messages.followupId, desc(messages.occurredAt));
  const files = owner.length
    ? await tx
        .select({
          messageId: attachments.messageId,
          kind: attachments.kind,
          deletedAt: attachments.deletedAt,
          transcript: voiceTranscripts.text,
        })
        .from(attachments)
        .leftJoin(
          voiceTranscripts,
          eq(voiceTranscripts.attachmentId, attachments.id),
        )
        .where(
          inArray(
            attachments.messageId,
            owner.map((row) => row.id),
          ),
        )
    : [];

  const open = await tx
    .selectDistinctOn([alerts.followupId], {
      followupId: alerts.followupId,
      reason: triageEvents.reason,
      at: alerts.createdAt,
    })
    .from(alerts)
    .innerJoin(triageEvents, eq(triageEvents.id, alerts.triageEventId))
    .where(and(inArray(alerts.followupId, ids), ne(alerts.status, "resolved")))
    .orderBy(alerts.followupId, desc(alerts.createdAt));

  const primary = await tx
    .selectDistinctOn([consents.followupId], {
      followupId: consents.followupId,
      state: consents.state,
    })
    .from(consents)
    .innerJoin(
      followupContacts,
      eq(followupContacts.id, consents.followupContactId),
    )
    .where(
      and(
        inArray(consents.followupId, ids),
        eq(followupContacts.role, "primary"),
      ),
    )
    .orderBy(consents.followupId, desc(consents.recordedAt), desc(consents.id));

  return {
    lastMessage: new Map(latest.map((row) => [row.followupId, row.at])),
    lastOwner: new Map(
      owner.map((row) => {
        const file = files.find((entry) => entry.messageId === row.id);
        const media =
          file?.kind === "photo"
            ? ("photo" as const)
            : file?.kind === "voice"
              ? ("voice" as const)
              : null;
        const transcript = file && !file.deletedAt ? file.transcript : null;
        return [
          row.followupId,
          {
            text: excerpt(row.body.trim() || transcript?.trim() || ""),
            media,
            at: row.at,
          },
        ];
      }),
    ),
    openAlert: new Map(
      open.map((row) => [row.followupId, { reason: row.reason, at: row.at }]),
    ),
    consent: new Map(primary.map((row) => [row.followupId, row.state])),
  };
}

function summaryOf(
  view: FollowupClinical,
  facts: Awaited<ReturnType<typeof clinicalFacts>>,
): DashboardSummary {
  const alert = facts.openAlert.get(view.id);
  const owner = facts.lastOwner.get(view.id);
  if (alert)
    return {
      kind: "alert",
      reason: alert.reason,
      at: alert.at,
      owner:
        owner && (owner.text || owner.media)
          ? { text: owner.text, media: owner.media }
          : null,
    };
  if (view.status === "paused") return { kind: "paused" };
  if (view.status === "human_takeover") return { kind: "human_takeover" };
  const consent = facts.consent.get(view.id) ?? null;
  if (consent === "withdrawn") return { kind: "consent_withdrawn" };
  if (owner && (owner.text || owner.media)) return { kind: "owner", ...owner };
  if (consent === "requested") return { kind: "consent_requested" };
  if (consent === null) return { kind: "not_started" };
  return { kind: "quiet" };
}

const TRIAGE_ORDER = { urgent: 0, watch: 1, normal: 2 } as const;

export type TodayService = ReturnType<typeof todayService>;

export function todayService(deps: {
  db: Database;
  followups: FollowupsService;
  drveto: DrVetoConnector;
}) {
  const { db, followups, drveto } = deps;

  return {
    async today(actor: Actor, now = new Date()): Promise<TodayView> {
      const can = (permission: Parameters<typeof actor.permissions.has>[0]) =>
        actor.permissions.has(permission);
      const views =
        can("followups.read_all") ||
        can("followups.read_own") ||
        can("followups.read_summary")
          ? await followups.list(actor)
          : [];
      const clinical = views.filter(
        (view): view is FollowupClinical =>
          view.access === "clinical" && ONGOING.has(view.status),
      );
      const readable = new Set(
        views.filter((view) => view.access === "clinical").map((v) => v.id),
      );

      return withTenant(
        db,
        { organizationId: actor.organizationId, userId: actor.userId },
        async (tx) => {
          const facts = await clinicalFacts(
            tx,
            clinical.map((view) => view.id),
          );
          const rows: DashboardFollowup[] = clinical
            .map((view) => ({
              id: view.id,
              animalName: view.animalName,
              species: view.species,
              status: view.status,
              triage: view.triage,
              procedure: view.procedure,
              procedureAt: view.procedureAt,
              responsibleName: view.responsibleName,
              consent: facts.consent.get(view.id) ?? null,
              lastActivityAt:
                facts.lastMessage.get(view.id) ?? view.startedAt ?? null,
              summary: summaryOf(view, facts),
            }))
            .sort(
              (a, b) =>
                TRIAGE_ORDER[a.triage] - TRIAGE_ORDER[b.triage] ||
                (b.lastActivityAt?.getTime() ?? 0) -
                  (a.lastActivityAt?.getTime() ?? 0),
            );

          const activity = await followupActivity(tx);
          let agenda: DashboardAgendaItem[] | null = null;
          let stiveaAppointments = 0;
          if (can("agenda.read")) {
            const { start, end } = parisDayBounds(now);
            const booked = await tx
              .select({
                id: appointments.id,
                startsAt: appointments.startsAt,
                endsAt: appointments.endsAt,
                kind: appointments.kind,
                status: appointments.status,
                source: appointments.source,
                followupId: appointments.followupId,
                animalName: animals.name,
                vetName: users.displayName,
              })
              .from(appointments)
              .innerJoin(animals, eq(animals.id, appointments.animalId))
              .innerJoin(
                memberships,
                eq(memberships.id, appointments.membershipId),
              )
              .innerJoin(users, eq(users.id, memberships.userId))
              .where(
                and(
                  gte(appointments.startsAt, start),
                  lt(appointments.startsAt, end),
                  ne(appointments.status, "cancelled"),
                ),
              )
              .orderBy(asc(appointments.startsAt));
            const items: DashboardAgendaItem[] = booked.map((row) => ({
              id: row.id,
              startsAt: row.startsAt,
              endsAt: row.endsAt,
              title: `${APPOINTMENT_TITLES[row.kind]} · ${row.animalName}`,
              kind: APPOINTMENT_KINDS[row.kind],
              vetName: row.vetName,
              fromStivea: row.source !== "drveto",
              followupId:
                row.followupId && readable.has(row.followupId)
                  ? row.followupId
                  : null,
            }));
            stiveaAppointments = booked.filter(
              (row) => row.source !== "drveto" && row.status === "confirmed",
            ).length;

            const [connected] = await tx
              .select({ provider: integrationConnections.provider })
              .from(integrationConnections)
              .where(eq(integrationConnections.provider, "drveto"));
            if (connected)
              for (const entry of await drveto.agendaOfDay(now))
                items.push({
                  id: entry.ref,
                  startsAt: entry.startsAt,
                  endsAt: entry.endsAt,
                  title: entry.title,
                  kind: DRVETO_KINDS[entry.kind],
                  vetName: entry.practitionerName,
                  fromStivea: false,
                  followupId: null,
                });
            agenda = items.sort(
              (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
            );
          }

          return {
            views,
            followups: rows,
            activeFollowups: activity.activeFollowups,
            includedFollowups: INCLUDED_ACTIVE_FOLLOWUPS,
            agenda,
            stiveaAppointments,
          };
        },
      );
    },
  };
}
