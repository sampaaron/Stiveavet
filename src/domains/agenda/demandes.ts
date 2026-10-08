import { and, asc, desc, eq, gt, inArray, lt, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { DomainError, assertPermission } from "@/domains/equipe/actor";
import type { Actor } from "@/domains/equipe/actor";
import { loadFollowup } from "@/domains/suivis/lancement";
import { enqueue } from "@/domains/taches/queue";
import {
  agendaFreeSlots,
  alerts,
  animals,
  appointmentDurations,
  appointmentRequests,
  appointments,
  availabilityWindows,
  followups,
  memberships,
  protocolVersions,
  users,
} from "@/server/db/schema";
import { tenantRunner } from "@/server/db/tenant";
import type { Database, TenantTransaction } from "@/server/db/tenant";
import { auditFollowup as audit } from "@/domains/audit/journal";

import {
  DEFAULT_APPOINTMENT_MINUTES,
  SEARCH_HORIZON_DAYS,
  appointmentKindOf,
  fitSlots,
} from "./rendez-vous";
import type { AppointmentKind, Interval } from "./rendez-vous";

/**
 * Demandes de rendez-vous faites à Numa et confirmation par le cabinet (cahier des charges §8,
 * ADR 0021). Numa propose ; une personne du cabinet qui en a le droit (`appointments.confirm`,
 * vétérinaires par défaut, assistants sur décision de l'administrateur) confirme ou refuse ;
 * Numa prévient alors le propriétaire. La base revérifie créneau, plage et droit (0014).
 */

const DAY_MS = 86_400_000;

/** Verrou par vétérinaire : deux propriétaires ne prennent jamais le même créneau. */
export async function lockVetAgenda(
  tx: TenantTransaction,
  membershipId: string,
) {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`appointments:${membershipId}`}))`,
  );
}

/** Type du rendez-vous : urgence si une urgence est en cours, sinon selon le protocole. */
export async function appointmentKindFor(
  tx: TenantTransaction,
  followupId: string,
): Promise<AppointmentKind> {
  const [urgent] = await tx
    .select({ id: alerts.id })
    .from(alerts)
    .where(
      and(
        eq(alerts.followupId, followupId),
        eq(alerts.level, "urgent"),
        ne(alerts.status, "resolved"),
      ),
    )
    .limit(1);
  const [protocol] = await tx
    .select({ category: protocolVersions.category })
    .from(followups)
    .innerJoin(
      protocolVersions,
      eq(protocolVersions.id, followups.protocolVersionId),
    )
    .where(eq(followups.id, followupId));
  return appointmentKindOf(protocol?.category ?? null, Boolean(urgent));
}

export async function appointmentMinutes(
  tx: TenantTransaction,
  kind: AppointmentKind,
): Promise<number> {
  const [row] = await tx
    .select({ minutes: appointmentDurations.minutes })
    .from(appointmentDurations)
    .where(eq(appointmentDurations.kind, kind));
  return row?.minutes ?? DEFAULT_APPOINTMENT_MINUTES[kind];
}

/**
 * Créneaux à proposer avec ce vétérinaire : créneaux libres capturés, plages approuvées,
 * moins les rendez-vous existants et les créneaux déjà proposés ailleurs.
 */
export async function findSlots(
  tx: TenantTransaction,
  input: {
    membershipId: string;
    minutes: number;
    now: Date;
    exceptRequestId?: string;
    limit?: number;
  },
): Promise<Date[]> {
  const { membershipId, minutes, now } = input;
  const horizon = new Date(now.getTime() + SEARCH_HORIZON_DAYS * DAY_MS);
  const windows = await tx
    .select({
      weekday: availabilityWindows.weekday,
      startsAt: availabilityWindows.startsAt,
      endsAt: availabilityWindows.endsAt,
    })
    .from(availabilityWindows)
    .where(eq(availabilityWindows.kind, "appointments"));
  if (windows.length === 0) return [];
  const free = await tx
    .select({
      startsAt: agendaFreeSlots.startsAt,
      endsAt: agendaFreeSlots.endsAt,
    })
    .from(agendaFreeSlots)
    .where(
      and(
        eq(agendaFreeSlots.membershipId, membershipId),
        gt(agendaFreeSlots.startsAt, now),
        lt(agendaFreeSlots.startsAt, horizon),
      ),
    )
    .orderBy(asc(agendaFreeSlots.startsAt));
  const booked: Interval[] = await tx
    .select({ startsAt: appointments.startsAt, endsAt: appointments.endsAt })
    .from(appointments)
    .where(
      and(
        eq(appointments.membershipId, membershipId),
        ne(appointments.status, "cancelled"),
        gt(appointments.endsAt, now),
      ),
    );
  const offered = await tx
    .select({
      id: appointmentRequests.id,
      slotStarts: appointmentRequests.slotStarts,
      minutes: appointmentRequests.minutes,
    })
    .from(appointmentRequests)
    .where(
      and(
        eq(appointmentRequests.membershipId, membershipId),
        eq(appointmentRequests.status, "offered"),
        gt(appointmentRequests.expiresAt, now),
      ),
    );
  const held = offered
    .filter((request) => request.id !== input.exceptRequestId)
    .flatMap((request) =>
      request.slotStarts.map((startsAt) => ({
        startsAt,
        endsAt: new Date(startsAt.getTime() + request.minutes * 60_000),
      })),
    );
  return fitSlots({
    free,
    windows,
    busy: [...booked, ...held],
    minutes,
    now,
    limit: input.limit,
  });
}

/** Le créneau choisi est-il toujours libre ? (sous le verrou du vétérinaire) */
export async function slotStillFree(
  tx: TenantTransaction,
  input: {
    membershipId: string;
    startsAt: Date;
    minutes: number;
    requestId: string;
    now: Date;
  },
): Promise<boolean> {
  await lockVetAgenda(tx, input.membershipId);
  const slots = await findSlots(tx, {
    membershipId: input.membershipId,
    minutes: input.minutes,
    now: input.now,
    exceptRequestId: input.requestId,
    limit: 1000,
  });
  return slots.some((start) => start.getTime() === input.startsAt.getTime());
}

// Côté cabinet -------------------------------------------------------------------------

export type PendingAppointment = {
  id: string;
  followupId: string;
  animalName: string;
  vetName: string;
  kind: AppointmentKind;
  startsAt: Date;
  endsAt: Date;
  requestedAt: Date;
};

export type CallbackRequest = {
  id: string;
  followupId: string;
  animalName: string;
  vetName: string;
  kind: AppointmentKind;
  requestedAt: Date;
};

export type AppointmentDesk = {
  pending: PendingAppointment[];
  callbacks: CallbackRequest[];
  canConfirm: boolean;
};

const uuid = z.uuid();

/** Messages de Numa après une décision du cabinet : tâche `followup.message` idempotente. */
async function notifyOwner(
  tx: TenantTransaction,
  organizationId: string,
  followupId: string,
  step: "appointment_confirmed" | "appointment_declined",
  appointmentId: string,
) {
  await enqueue(tx, {
    organizationId,
    kind: "followup.message",
    idempotencyKey: `followup:${followupId}:${step}:${appointmentId}`,
    runAt: new Date(),
    followupId,
    payload: { step, appointmentId },
  });
}

export function appointmentsService(db: Database) {
  const run = tenantRunner(db);

  /** Rendez-vous proposé par Numa, d'un suivi que la personne peut voir. */
  async function loadPending(
    tx: TenantTransaction,
    actor: Actor,
    appointmentId: string,
  ) {
    if (!uuid.safeParse(appointmentId).success)
      throw new DomainError("not_found");
    const [row] = await tx
      .select({
        id: appointments.id,
        followupId: appointments.followupId,
        status: appointments.status,
        source: appointments.source,
      })
      .from(appointments)
      .where(eq(appointments.id, appointmentId))
      .for("update");
    if (!row?.followupId || row.source !== "numa")
      throw new DomainError("not_found");
    // Visibilité du dossier (résumé suffisant : aucun contenu clinique ici).
    const followup = await loadFollowup(tx, actor, row.followupId);
    if (followup.access === "none") throw new DomainError("not_found");
    if (row.status !== "proposed") throw new DomainError("invalid_transition");
    return { ...row, followupId: row.followupId };
  }

  async function closeRequestOf(
    tx: TenantTransaction,
    actor: Actor,
    appointmentId: string,
  ) {
    await tx
      .update(appointmentRequests)
      .set({
        status: "closed",
        closedAt: new Date(),
        closedByMembershipId: actor.membershipId,
      })
      .where(
        and(
          eq(appointmentRequests.appointmentId, appointmentId),
          eq(appointmentRequests.status, "chosen"),
        ),
      );
  }

  return {
    /** Rendez-vous à confirmer et demandes à rappeler, pour les suivis visibles. */
    async desk(actor: Actor, now = new Date()): Promise<AppointmentDesk> {
      assertPermission(actor, "agenda.read");
      return run(actor, async (tx) => {
        const vet = users;
        const pendingRows = await tx
          .select({
            id: appointments.id,
            followupId: appointments.followupId,
            animalName: animals.name,
            vetName: vet.displayName,
            kind: appointments.kind,
            startsAt: appointments.startsAt,
            endsAt: appointments.endsAt,
            requestedAt: appointments.createdAt,
          })
          .from(appointments)
          .innerJoin(animals, eq(animals.id, appointments.animalId))
          .innerJoin(memberships, eq(memberships.id, appointments.membershipId))
          .innerJoin(vet, eq(vet.id, memberships.userId))
          .where(
            and(
              eq(appointments.status, "proposed"),
              eq(appointments.source, "numa"),
              gt(appointments.endsAt, now),
            ),
          )
          .orderBy(asc(appointments.startsAt));
        const callbackRows = await tx
          .select({
            id: appointmentRequests.id,
            followupId: appointmentRequests.followupId,
            animalName: animals.name,
            vetName: vet.displayName,
            kind: appointmentRequests.kind,
            requestedAt: appointmentRequests.createdAt,
          })
          .from(appointmentRequests)
          .innerJoin(
            followups,
            eq(followups.id, appointmentRequests.followupId),
          )
          .innerJoin(animals, eq(animals.id, followups.animalId))
          .innerJoin(
            memberships,
            eq(memberships.id, appointmentRequests.membershipId),
          )
          .innerJoin(vet, eq(vet.id, memberships.userId))
          .where(eq(appointmentRequests.status, "callback"))
          .orderBy(desc(appointmentRequests.createdAt));
        // Seulement les suivis que la personne peut voir.
        const ids = [
          ...new Set(
            [...pendingRows, ...callbackRows]
              .map((row) => row.followupId)
              .filter((id): id is string => Boolean(id)),
          ),
        ];
        const visible = new Set<string>();
        for (const id of ids) {
          const followup = await loadFollowup(tx, actor, id).catch(() => null);
          if (followup && followup.access !== "none") visible.add(id);
        }
        return {
          pending: pendingRows
            .filter((row) => row.followupId && visible.has(row.followupId))
            .map((row) => ({ ...row, followupId: row.followupId ?? "" })),
          callbacks: callbackRows.filter((row) => visible.has(row.followupId)),
          canConfirm: actor.permissions.has("appointments.confirm"),
        };
      });
    },

    /** Confirmer un créneau choisi par le propriétaire ; Numa le lui confirme. */
    async confirm(actor: Actor, appointmentId: string) {
      assertPermission(actor, "appointments.confirm");
      await run(actor, async (tx) => {
        const row = await loadPending(tx, actor, appointmentId);
        await tx
          .update(appointments)
          .set({
            status: "confirmed",
            confirmedAt: new Date(),
            confirmedByMembershipId: actor.membershipId,
          })
          .where(eq(appointments.id, row.id));
        await closeRequestOf(tx, actor, row.id);
        await notifyOwner(
          tx,
          actor.organizationId,
          row.followupId,
          "appointment_confirmed",
          row.id,
        );
        await audit(tx, actor, "appointment.confirmed", row.followupId, {
          appointmentId: row.id,
        });
      });
    },

    /** Refuser le créneau : le cabinet recontacte le propriétaire, Numa le prévient. */
    async decline(actor: Actor, appointmentId: string) {
      assertPermission(actor, "appointments.confirm");
      await run(actor, async (tx) => {
        const row = await loadPending(tx, actor, appointmentId);
        await tx
          .update(appointments)
          .set({ status: "cancelled", cancelledAt: new Date() })
          .where(eq(appointments.id, row.id));
        await closeRequestOf(tx, actor, row.id);
        await notifyOwner(
          tx,
          actor.organizationId,
          row.followupId,
          "appointment_declined",
          row.id,
        );
        await audit(tx, actor, "appointment.declined", row.followupId, {
          appointmentId: row.id,
        });
      });
    },

    /** Demande sans créneau : le cabinet a rappelé le propriétaire. */
    async closeCallback(actor: Actor, requestId: string) {
      assertPermission(actor, "appointments.confirm");
      if (!uuid.safeParse(requestId).success)
        throw new DomainError("not_found");
      await run(actor, async (tx) => {
        const [request] = await tx
          .select({
            id: appointmentRequests.id,
            followupId: appointmentRequests.followupId,
            status: appointmentRequests.status,
          })
          .from(appointmentRequests)
          .where(eq(appointmentRequests.id, requestId))
          .for("update");
        if (!request) throw new DomainError("not_found");
        const followup = await loadFollowup(tx, actor, request.followupId);
        if (followup.access === "none") throw new DomainError("not_found");
        if (request.status !== "callback")
          throw new DomainError("invalid_transition");
        await tx
          .update(appointmentRequests)
          .set({
            status: "closed",
            closedAt: new Date(),
            closedByMembershipId: actor.membershipId,
          })
          .where(eq(appointmentRequests.id, request.id));
        await audit(
          tx,
          actor,
          "appointment.callback_done",
          request.followupId,
          {
            requestId: request.id,
          },
        );
      });
    },

    /** Rendez-vous proposés et confirmés d'un suivi (carte du dossier). */
    async ofFollowup(actor: Actor, followupId: string, now = new Date()) {
      assertPermission(actor, "agenda.read");
      return run(actor, async (tx) => {
        const followup = await loadFollowup(tx, actor, followupId);
        if (followup.access === "none") throw new DomainError("not_found");
        return tx
          .select({
            id: appointments.id,
            kind: appointments.kind,
            status: appointments.status,
            source: appointments.source,
            startsAt: appointments.startsAt,
            endsAt: appointments.endsAt,
          })
          .from(appointments)
          .where(
            and(
              eq(appointments.followupId, followupId),
              inArray(appointments.status, ["proposed", "confirmed"]),
              gt(appointments.endsAt, now),
            ),
          )
          .orderBy(asc(appointments.startsAt));
      });
    },
  };
}

export type AppointmentsService = ReturnType<typeof appointmentsService>;
