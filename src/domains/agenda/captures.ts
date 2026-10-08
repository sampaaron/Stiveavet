import { randomUUID } from "node:crypto";

import { and, asc, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import type { AiGateway, FreeSlot } from "@/adapters/ai-gateway/types";
import type { ObjectStorage } from "@/adapters/object-storage";
import { DomainError, assertPermission } from "@/domains/equipe/actor";
import type { Actor } from "@/domains/equipe/actor";
import {
  MAX_CAPTURE_BYTES,
  sha256Hex,
  sniffImage,
} from "@/domains/fichiers/media";
import { PURGE_KIND } from "@/domains/fichiers/service";
import { enqueue } from "@/domains/taches/queue";
import {
  agendaFreeSlots,
  attachments,
  auditEvents,
  memberships,
  users,
} from "@/server/db/schema";
import { withTenant } from "@/server/db/tenant";
import type { Database, TenantTransaction } from "@/server/db/tenant";

/**
 * Capture d'écran d'agenda (cahier des charges §8, architecture §7, ADR 0019), en attendant
 * les intégrations d'agenda : le vétérinaire ou un assistant autorisé (`agenda.capture`)
 * envoie une capture ; Stivea Vet en lit les créneaux libres (lecture simulée en phase 2)
 * puis supprime le fichier aussitôt, que la lecture réussisse ou non. Une tâche de
 * suppression est posée dès le dépôt : même après une panne, la capture ne vit pas un jour.
 * Seuls les créneaux sont gardés ; Numa ne fera que les proposer (lot 18).
 */

/** Une capture ne sert qu'à la lecture : supprimée dès la lecture, au plus tard sous 23 h. */
const CAPTURE_RETENTION = sql`now() + interval '23 hours'`;
const CAPTURE_RETENTION_HOURS = 23;
const MAX_SLOTS = 40;
const MAX_HORIZON_DAYS = 60;
const MAX_SLOT_HOURS = 4;

export type FreeSlotView = {
  id: string;
  membershipId: string;
  vetName: string;
  startsAt: Date;
  endsAt: Date;
};

export type CaptureView = { createdAt: Date; deletedAt: Date | null };

/** Créneaux plausibles seulement : à venir, courts, dans les deux mois. */
function plausibleSlots(slots: readonly FreeSlot[], now: Date): FreeSlot[] {
  const horizon = now.getTime() + MAX_HORIZON_DAYS * 86_400_000;
  const seen = new Set<number>();
  return slots
    .filter(
      ({ startsAt, endsAt }) =>
        startsAt.getTime() > now.getTime() &&
        startsAt.getTime() < horizon &&
        endsAt.getTime() > startsAt.getTime() &&
        endsAt.getTime() - startsAt.getTime() <= MAX_SLOT_HOURS * 3_600_000,
    )
    .filter(({ startsAt }) => {
      if (seen.has(startsAt.getTime())) return false;
      seen.add(startsAt.getTime());
      return true;
    })
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .slice(0, MAX_SLOTS);
}

const uuid = z.uuid();

export type AgendaService = ReturnType<typeof agendaService>;

export function agendaService(deps: {
  db: Database;
  storage: ObjectStorage;
  ai: AiGateway;
}) {
  const { db, storage, ai } = deps;
  const run = <T>(actor: Actor, fn: (tx: TenantTransaction) => Promise<T>) =>
    withTenant(
      db,
      { organizationId: actor.organizationId, userId: actor.userId },
      fn,
    );

  async function audit(
    tx: TenantTransaction,
    actor: Actor,
    action: string,
    targetId: string,
    metadata: Record<string, string | number>,
  ) {
    await tx.insert(auditEvents).values({
      organizationId: actor.organizationId,
      actorMembershipId: actor.membershipId,
      action,
      targetType: "attachment",
      targetId,
      metadata,
    });
  }

  /** Vétérinaires actifs du cabinet, dont l'agenda peut être capturé. */
  function vetsQuery(tx: TenantTransaction) {
    return tx
      .select({ membershipId: memberships.id, name: users.displayName })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(
        and(
          inArray(memberships.role, ["admin_vet", "vet"]),
          isNull(memberships.deactivatedAt),
        ),
      )
      .orderBy(asc(users.displayName));
  }

  return {
    async vets(actor: Actor) {
      assertPermission(actor, "agenda.capture");
      return run(actor, (tx) => vetsQuery(tx));
    },

    /** Créneaux libres à venir, tous vétérinaires confondus. */
    async freeSlots(actor: Actor): Promise<FreeSlotView[]> {
      assertPermission(actor, "agenda.read");
      return run(actor, (tx) =>
        tx
          .select({
            id: agendaFreeSlots.id,
            membershipId: agendaFreeSlots.membershipId,
            vetName: users.displayName,
            startsAt: agendaFreeSlots.startsAt,
            endsAt: agendaFreeSlots.endsAt,
          })
          .from(agendaFreeSlots)
          .innerJoin(
            memberships,
            eq(memberships.id, agendaFreeSlots.membershipId),
          )
          .innerJoin(users, eq(users.id, memberships.userId))
          .where(gt(agendaFreeSlots.endsAt, new Date()))
          .orderBy(asc(agendaFreeSlots.startsAt), asc(users.displayName)),
      );
    },

    /** Dernières captures reçues : date de réception et de suppression (preuve visible). */
    async recentCaptures(actor: Actor): Promise<CaptureView[]> {
      assertPermission(actor, "agenda.capture");
      return run(actor, (tx) =>
        tx
          .select({
            createdAt: attachments.createdAt,
            deletedAt: attachments.deletedAt,
          })
          .from(attachments)
          .where(eq(attachments.kind, "agenda_capture"))
          .orderBy(desc(attachments.createdAt))
          .limit(5),
      );
    },

    /**
     * Capture d'agenda d'un vétérinaire : dépôt, lecture des créneaux libres, suppression
     * immédiate du fichier. Les créneaux lus remplacent ceux, à venir, de la capture
     * précédente de ce vétérinaire ; une capture illisible ne retire rien.
     */
    async importCapture(
      actor: Actor,
      input: { vetMembershipId: string; bytes: Uint8Array },
    ): Promise<{ attachmentId: string; slotCount: number }> {
      assertPermission(actor, "agenda.capture");
      if (!uuid.safeParse(input.vetMembershipId).success)
        throw new DomainError("invalid_target");
      const contentType = sniffImage(input.bytes);
      if (
        !contentType ||
        input.bytes.length === 0 ||
        input.bytes.length > MAX_CAPTURE_BYTES
      )
        throw new DomainError("invalid_file");
      const attachmentId = randomUUID();
      const key = `o/${actor.organizationId}/captures/${attachmentId}`;

      await run(actor, async (tx) => {
        const vets = await vetsQuery(tx);
        if (!vets.some((vet) => vet.membershipId === input.vetMembershipId))
          throw new DomainError("invalid_target");
        await tx.insert(attachments).values({
          id: attachmentId,
          organizationId: actor.organizationId,
          followupId: null,
          messageId: null,
          kind: "agenda_capture",
          storageKey: key,
          contentType,
          byteSize: input.bytes.length,
          sha256: sha256Hex(input.bytes),
          retentionUntil: CAPTURE_RETENTION,
        });
        // Filet de sécurité : suppression à la date limite si la suite n'a pas abouti.
        await enqueue(tx, {
          organizationId: actor.organizationId,
          kind: PURGE_KIND,
          idempotencyKey: `attachment:${attachmentId}:purge`,
          runAt: new Date(Date.now() + CAPTURE_RETENTION_HOURS * 3_600_000),
          followupId: null,
          payload: { attachmentId },
        });
      });

      let slots: FreeSlot[] = [];
      try {
        await storage.putObject(key, { bytes: input.bytes, contentType });
        const reading = await ai.readAgendaCapture({
          image: input.bytes,
          contentType,
          now: new Date(),
        });
        slots = plausibleSlots(reading.slots, new Date());
      } catch {
        // Lecture impossible : la capture est supprimée quand même, ci-dessous.
        slots = [];
      } finally {
        await storage.deleteObject(key);
      }

      await run(actor, async (tx) => {
        await tx
          .update(attachments)
          .set({ deletedAt: new Date() })
          .where(eq(attachments.id, attachmentId));
        if (slots.length > 0) {
          await tx
            .delete(agendaFreeSlots)
            .where(
              and(
                eq(agendaFreeSlots.membershipId, input.vetMembershipId),
                gt(agendaFreeSlots.startsAt, new Date()),
              ),
            );
          await tx
            .insert(agendaFreeSlots)
            .values(
              slots.map((slot) => ({
                organizationId: actor.organizationId,
                membershipId: input.vetMembershipId,
                startsAt: slot.startsAt,
                endsAt: slot.endsAt,
                createdByMembershipId: actor.membershipId,
              })),
            )
            .onConflictDoNothing({
              target: [agendaFreeSlots.membershipId, agendaFreeSlots.startsAt],
            });
        }
        await audit(tx, actor, "agenda.capture_read", attachmentId, {
          slots: slots.length,
          vetMembershipId: input.vetMembershipId,
        });
      });
      if (slots.length === 0) throw new DomainError("capture_unreadable");
      return { attachmentId, slotCount: slots.length };
    },

    /** Retire un créneau (pris entre-temps, ou mal lu). */
    async removeSlot(actor: Actor, slotId: string) {
      assertPermission(actor, "agenda.capture");
      if (!uuid.safeParse(slotId).success) throw new DomainError("not_found");
      await run(actor, async (tx) => {
        const removed = await tx
          .delete(agendaFreeSlots)
          .where(eq(agendaFreeSlots.id, slotId))
          .returning({ id: agendaFreeSlots.id });
        if (removed.length === 0) throw new DomainError("not_found");
        await tx.insert(auditEvents).values({
          organizationId: actor.organizationId,
          actorMembershipId: actor.membershipId,
          action: "agenda.slot_removed",
          targetType: "agenda_slot",
          targetId: slotId,
          metadata: {},
        });
      });
    },
  };
}
