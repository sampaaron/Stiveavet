import { createHash } from "node:crypto";

import { asc, desc, eq, inArray } from "drizzle-orm";

import type { AiGateway, SynthesisEvent } from "@/adapters/ai-gateway/types";
import { DomainError, assertPermission } from "@/domains/equipe/actor";
import type { Actor } from "@/domains/equipe/actor";
import {
  triageReason,
  triageReasonColumns,
  triageRuleJoin,
} from "@/domains/urgences/reason";
import type { TriageReason } from "@/domains/urgences/reason";
import {
  acknowledgements,
  alerts,
  attachments,
  auditEvents,
  followupAlertRules,
  followupSyntheses,
  memberships,
  messages,
  photoObservations,
  triageEvents,
  users,
  voiceTranscripts,
} from "@/server/db/schema";
import { withTenant } from "@/server/db/tenant";
import type { Database, TenantTransaction } from "@/server/db/tenant";

import { daysSince } from "./calendrier";
import { loadFollowup } from "./lancement";
import { guardDraft, synthesisContent } from "./synthese-garde";
import type { SynthesisContent } from "./synthese-garde";

/**
 * Synthèse pré-consultation (cahier des charges §9, ADR 0020) : à l'ouverture du dossier,
 * l'évolution, les signaux rassurants et préoccupants et les questions ouvertes, rédigés par
 * la passerelle IA (simulée en phase 2) à partir des seuls échanges ; les alertes et le
 * décompte des messages, photos et vocaux sont tirés de la base telles quelles.
 * Réservée à l'accès clinique. Gardée en base avec l'empreinte des échanges couverts : elle
 * n'est refaite que si un message, une transcription, une observation ou un triage s'ajoute.
 * Chaque ligne rédigée passe les garde-fous : une citation du propriétaire doit être mot pour
 * mot ; le reste ne peut contenir ni diagnostic, ni dosage, ni prescription, ni réassurance.
 */

const SYNTHESIS_VERSION = "v1";

export type SynthesisAlert = {
  id: string;
  level: "watch" | "urgent";
  status: "open" | "acknowledged" | "escalated" | "resolved";
  reason: TriageReason;
  createdAt: Date;
  acknowledgedBy: string | null;
};

export type SynthesisView = SynthesisContent & {
  exchanges: { ownerMessages: number; photos: number; voiceNotes: number };
  alerts: SynthesisAlert[];
  generatedAt: Date;
  simulated: boolean;
};

type Sources = {
  events: SynthesisEvent[];
  digest: string;
  exchanges: SynthesisView["exchanges"];
};

/** Échanges du dossier transmis à la passerelle : textes et transcriptions, sans nom. */
async function loadSources(
  tx: TenantTransaction,
  followupId: string,
  language: "fr" | "en",
): Promise<Sources> {
  const rows = await tx
    .select({
      id: messages.id,
      author: messages.author,
      body: messages.body,
      occurredAt: messages.occurredAt,
    })
    .from(messages)
    .where(eq(messages.followupId, followupId))
    .orderBy(asc(messages.occurredAt), asc(messages.id));
  const files = await tx
    .select({
      id: attachments.id,
      messageId: attachments.messageId,
      kind: attachments.kind,
      deletedAt: attachments.deletedAt,
      transcriptId: voiceTranscripts.id,
      transcript: voiceTranscripts.text,
    })
    .from(attachments)
    .leftJoin(
      voiceTranscripts,
      eq(voiceTranscripts.attachmentId, attachments.id),
    )
    .where(eq(attachments.followupId, followupId));
  const observed = await tx
    .select({ id: photoObservations.id })
    .from(photoObservations)
    .where(eq(photoObservations.followupId, followupId));
  const triage = await tx
    .select({
      id: triageEvents.id,
      messageId: triageEvents.messageId,
      level: triageEvents.level,
    })
    .from(triageEvents)
    .where(eq(triageEvents.followupId, followupId));

  const rank = { normal: 0, watch: 1, urgent: 2 } as const;
  const levelOf = new Map<string, "normal" | "watch" | "urgent">();
  for (const event of triage) {
    if (!event.messageId) continue;
    const current = levelOf.get(event.messageId);
    if (!current || rank[event.level] > rank[current])
      levelOf.set(event.messageId, event.level);
  }

  const events: SynthesisEvent[] = [];
  for (const row of rows) {
    if (row.author === "system") continue;
    const file = files.find((entry) => entry.messageId === row.id);
    const media =
      file?.kind === "photo"
        ? "photo"
        : file?.kind === "voice"
          ? "voice"
          : null;
    // Un fichier effacé l'est avec sa transcription : rien n'en est transmis.
    const transcript = file && !file.deletedAt ? file.transcript : null;
    const text = row.body.trim() || transcript?.trim() || "";
    // Vocal sans transcription (en cours ou effacée) : compté, mais rien à citer.
    if (media === "voice" && !text) continue;
    events.push({
      at: row.occurredAt,
      from: row.author,
      text,
      media,
      triage: row.author === "owner" ? (levelOf.get(row.id) ?? null) : null,
    });
  }

  const parts = [
    `${SYNTHESIS_VERSION}:${language}`,
    ...rows.map((row) => `m:${row.id}`),
    ...files.map(
      (file) =>
        `f:${file.id}:${file.deletedAt ? "x" : ""}:${file.transcriptId ?? ""}`,
    ),
    ...observed.map((row) => `o:${row.id}`),
    ...triage.map((row) => `t:${row.id}`),
  ].sort();
  return {
    events,
    digest: createHash("sha256").update(parts.join("\n")).digest("hex"),
    exchanges: {
      ownerMessages: rows.filter((row) => row.author === "owner").length,
      photos: files.filter((file) => file.kind === "photo").length,
      voiceNotes: files.filter((file) => file.kind === "voice").length,
    },
  };
}

async function loadAlerts(
  tx: TenantTransaction,
  followupId: string,
): Promise<SynthesisAlert[]> {
  const rows = await tx
    .select({
      id: alerts.id,
      level: alerts.level,
      status: alerts.status,
      ...triageReasonColumns,
      createdAt: alerts.createdAt,
    })
    .from(alerts)
    .innerJoin(triageEvents, eq(triageEvents.id, alerts.triageEventId))
    .leftJoin(followupAlertRules, triageRuleJoin)
    .where(eq(alerts.followupId, followupId))
    .orderBy(desc(alerts.createdAt))
    .limit(5);
  if (!rows.length) return [];
  const acks = await tx
    .select({ alertId: acknowledgements.alertId, name: users.displayName })
    .from(acknowledgements)
    .innerJoin(memberships, eq(memberships.id, acknowledgements.membershipId))
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      inArray(
        acknowledgements.alertId,
        rows.map((row) => row.id),
      ),
    )
    .orderBy(asc(acknowledgements.acknowledgedAt));
  return rows.map((row) => ({
    id: row.id,
    level: row.level,
    status: row.status,
    reason: triageReason(row),
    createdAt: row.createdAt,
    acknowledgedBy: acks.find((ack) => ack.alertId === row.id)?.name ?? null,
  }));
}

export type SynthesisService = ReturnType<typeof synthesisService>;

export function synthesisService(deps: { db: Database; ai: AiGateway }) {
  const { db, ai } = deps;
  const run = <T>(actor: Actor, fn: (tx: TenantTransaction) => Promise<T>) =>
    withTenant(
      db,
      { organizationId: actor.organizationId, userId: actor.userId },
      fn,
    );

  return {
    /**
     * Synthèse du dossier pour un lecteur autorisé aux données cliniques ; null pour un suivi
     * pas encore lancé. Inexistant ou non autorisé : not_found, comme le dossier.
     * La rédaction (appel à la passerelle IA) se fait hors transaction.
     */
    async forFollowup(
      actor: Actor,
      followupId: string,
      options: { language?: "fr" | "en"; now?: Date } = {},
    ): Promise<SynthesisView | null> {
      assertPermission(actor, "clinical.read");
      const language = options.language ?? "fr";
      const now = options.now ?? new Date();
      const read = await run(actor, async (tx) => {
        const followup = await loadFollowup(tx, actor, followupId);
        if (followup.access !== "clinical") return null;
        if (followup.status === "draft") return { draft: true as const };
        const sources = await loadSources(tx, followupId, language);
        const [stored] = await tx
          .select()
          .from(followupSyntheses)
          .where(eq(followupSyntheses.followupId, followupId));
        return {
          draft: false as const,
          followup,
          sources,
          stored,
          alerts: await loadAlerts(tx, followupId),
        };
      });
      // Accès « organisation seulement » : même réponse que pour un dossier inexistant.
      if (!read) throw new DomainError("not_found");
      if (read.draft) return null;

      const view = (content: SynthesisContent, generatedAt: Date) => ({
        ...content,
        exchanges: read.sources.exchanges,
        alerts: read.alerts,
        generatedAt,
        simulated: ai.simulated,
      });

      const cached = read.stored
        ? synthesisContent.safeParse(read.stored.content)
        : null;
      if (
        read.stored &&
        cached?.success &&
        read.stored.sourceDigest === read.sources.digest
      )
        return view(cached.data, read.stored.generatedAt);

      const draft = await ai.summarizeFollowup({
        language,
        procedure: read.followup.procedure,
        dayNumber: daysSince(read.followup.procedureAt, now),
        events: read.sources.events,
      });
      const { content, reasons } = guardDraft(
        draft,
        read.sources.events.map((event) => event.text),
        language,
      );
      const generatedAt = new Date();
      await run(actor, async (tx) => {
        await tx
          .insert(followupSyntheses)
          .values({
            followupId,
            organizationId: actor.organizationId,
            content,
            sourceDigest: read.sources.digest,
            generatedAt,
          })
          .onConflictDoUpdate({
            target: followupSyntheses.followupId,
            set: { content, sourceDigest: read.sources.digest, generatedAt },
          });
        await tx.insert(auditEvents).values({
          organizationId: actor.organizationId,
          actorMembershipId: actor.membershipId,
          action: "synthesis.generated",
          targetType: "followup",
          targetId: followupId,
          // Motifs des lignes écartées seulement : jamais leur contenu.
          metadata: {
            engine: "simulated",
            withheld: content.withheld,
            reasons: [...new Set(reasons)],
          },
        });
      });
      return view(content, generatedAt);
    },
  };
}
