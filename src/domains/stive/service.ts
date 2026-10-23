import { randomUUID } from "node:crypto";

import { and, asc, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import type { AgendaService } from "@/domains/agenda/captures";
import type { AppointmentsService } from "@/domains/agenda/demandes";
import { auditFollowup, auditOrganization } from "@/domains/audit/journal";
import type { ConversationsService } from "@/domains/conversations/service";
import { DomainError, assertPermission } from "@/domains/equipe/actor";
import type { Actor } from "@/domains/equipe/actor";
import { VET_ROLES } from "@/domains/equipe/permissions";
import { currentPlan } from "@/domains/facturation/limits";
import { planDefinition } from "@/domains/facturation/rules";
import {
  parisDayIndex,
  parisLocalToDate,
  parisWallMinutes,
} from "@/domains/heure-paris";
import { daysSince } from "@/domains/suivis/calendrier";
import { TRANSITIONS } from "@/domains/suivis/lancement";
import type { LaunchService } from "@/domains/suivis/lancement";
import { canSteerFollowup } from "@/domains/suivis/policies";
import { followupAccessMap } from "@/domains/suivis/service";
import type {
  FollowupClinical,
  FollowupView,
  FollowupsService,
} from "@/domains/suivis/service";
import type { SynthesisService } from "@/domains/suivis/synthese";
import type { TodayService, TodayView } from "@/domains/suivis/tableau";
import type { AlertsService } from "@/domains/urgences/service";
import {
  followups,
  memberships,
  organizations,
  stiveMessages,
  stiveProposals,
  stiveUsage,
  users,
} from "@/server/db/schema";
import { tenantRunner } from "@/server/db/tenant";
import type { Database, TenantTransaction } from "@/server/db/tenant";

import { draftMessage } from "./brouillons";
import { recognize } from "./demandes";
import type {
  DraftTemplate,
  SlotPeriod,
  StatusChange,
  StiveRequest,
  Target,
  VetChoice,
} from "./demandes";
import { followupsOf, stiveAnswer, visibleAnswer } from "./reponses";
import type { StiveAnswer } from "./reponses";

/**
 * Stive, l'assistant IA de l'équipe (cahier des charges §10, ADR 0034).
 * - Il ne lit que ce que la personne peut voir, par les services des écrans (mêmes droits,
 *   même isolation entre cabinets).
 * - Il n'écrit rien lui-même : une action réelle est une proposition « À confirmer » ; le clic
 *   exécute l'action de l'écran concerné, qui revérifie tout, puis le journal note qu'elle a
 *   été préparée par Stive. Un brouillon n'est envoyé que par le bouton Envoyer du dossier.
 * - Ses échanges ne sont visibles que par leur auteur (la base l'impose) et effacés à 30 jours.
 * - Chaque demande compte dans la limite mensuelle de la formule.
 * La reconnaissance des demandes est simulée par des règles écrites (`demandes.ts`).
 */

const STIVE_RETENTION_DAYS = 30;
const MAX_MESSAGES = 60;
const MAX_CANDIDATES = 8;
const DAY_MS = 86_400_000;
const ONGOING = new Set(["active", "paused", "human_takeover"]);

export const stiveQuestion = z.string().trim().min(1).max(500);
const uuid = z.uuid();

export type StiveBriefing = Extract<StiveAnswer, { kind: "briefing" }>;
export type StiveDecision = "confirm" | "decline";
export type StiveOutcome =
  "confirmed" | "declined" | "paused" | "resumed" | "stopped";

export type StiveProposalView = {
  id: string;
  kind: "appointment" | "followup_status" | "message_draft";
  status: "open" | "done" | "expired";
  outcome: StiveOutcome | null;
  /** Texte du brouillon, pour l'aperçu de la carte. */
  draft: string | null;
};

export type StiveEntry =
  | { id: string; author: "member"; at: Date; question: string }
  | {
      id: string;
      author: "stive";
      at: Date;
      /** null : réponse sur un dossier devenu inaccessible, ou illisible. */
      answer: StiveAnswer | null;
    };

export type StiveConversation = {
  entries: StiveEntry[];
  proposals: Record<string, StiveProposalView>;
  usage: { used: number; limit: number };
};

const OUTCOMES: Record<StatusChange, StiveOutcome> = {
  pause: "paused",
  resume: "resumed",
  stop: "stopped",
};

/** Mois de Paris de l'instant, « AAAA-MM-01 ». */
export function parisMonth(now: Date): string {
  return `${new Date(parisWallMinutes(now) * 60_000).toISOString().slice(0, 7)}-01`;
}

/** Premier jour du mois de Paris suivant, « AAAA-MM-JJ ». */
function nextParisMonth(now: Date): string {
  const month = new Date(`${parisMonth(now)}T00:00:00Z`);
  month.setUTCMonth(month.getUTCMonth() + 1);
  return month.toISOString().slice(0, 10);
}

const isoDay = (day: number) =>
  new Date(day * DAY_MS).toISOString().slice(0, 10);

function dayStart(day: number): Date {
  const start = parisLocalToDate(`${isoDay(day)}T00:00`);
  if (!start) throw new Error("Jour de Paris introuvable");
  return start;
}

export type StiveService = ReturnType<typeof stiveService>;

export function stiveService(deps: {
  db: Database;
  followups: FollowupsService;
  today: TodayService;
  synthesis: SynthesisService;
  appointments: AppointmentsService;
  agenda: AgendaService;
  conversations: ConversationsService;
  launch: LaunchService;
  alerts: AlertsService;
}) {
  const { db } = deps;
  const run = tenantRunner(db);
  const can = (
    actor: Actor,
    permission: Parameters<Actor["permissions"]["has"]>[0],
  ) => actor.permissions.has(permission);

  async function monthlyLimit(tx: TenantTransaction) {
    const plan = await currentPlan(tx);
    return { plan, limit: planDefinition(plan).stiveMonthlyRequests };
  }

  /**
   * Compte une demande, sauf limite atteinte (false). L'incrément et la comparaison se font en
   * une seule requête : deux demandes simultanées ne dépassent jamais la limite.
   */
  async function countRequest(
    tx: TenantTransaction,
    actor: Actor,
    limit: number,
    now: Date,
  ): Promise<boolean> {
    if (limit <= 0) return false;
    const counted = await tx
      .insert(stiveUsage)
      .values({
        organizationId: actor.organizationId,
        membershipId: actor.membershipId,
        month: parisMonth(now),
        requests: 1,
      })
      .onConflictDoUpdate({
        target: [stiveUsage.membershipId, stiveUsage.month],
        set: { requests: sql`${stiveUsage.requests} + 1` },
        setWhere: sql`${stiveUsage.requests} < ${limit}`,
      })
      .returning({ requests: stiveUsage.requests });
    return counted.length > 0;
  }

  async function vetsOf(tx: TenantTransaction) {
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

  // Réponses -----------------------------------------------------------------------------

  type Built = {
    answer: StiveAnswer;
    proposals: (typeof stiveProposals.$inferInsert)[];
    /** Dossier dont le détail clinique a été consulté (journalisé). */
    viewed?: string;
  };

  const only = (answer: StiveAnswer): Built => ({ answer, proposals: [] });

  function proposal(
    actor: Actor,
    messageId: string,
    values: Pick<
      typeof stiveProposals.$inferInsert,
      "kind" | "followupId" | "appointmentId" | "change" | "draft"
    >,
  ): typeof stiveProposals.$inferInsert {
    return {
      id: randomUUID(),
      organizationId: actor.organizationId,
      membershipId: actor.membershipId,
      messageId,
      ...values,
    };
  }

  async function briefing(
    actor: Actor,
    now: Date,
    known?: TodayView,
  ): Promise<StiveBriefing> {
    const view = known ?? (await deps.today.today(actor, now));
    const line = (followup: (typeof view.followups)[number]) => ({
      id: followup.id,
      animalName: followup.animalName,
      procedure: followup.procedure,
      dayNumber: daysSince(followup.procedureAt, now),
      responsibleName: followup.responsibleName,
    });
    const clinical = can(actor, "clinical.read");
    const unacknowledged = clinical
      ? (await deps.alerts.open(actor)).filter(
          (alert) => alert.status === "open" || alert.status === "escalated",
        ).length
      : null;
    const pending = can(actor, "agenda.read")
      ? (await deps.appointments.desk(actor, now)).pending.length
      : null;
    return {
      kind: "briefing",
      urgent: view.followups
        .filter((f) => f.triage === "urgent")
        .slice(0, 30)
        .map(line),
      watch: view.followups
        .filter((f) => f.triage === "watch")
        .slice(0, 30)
        .map(line),
      unacknowledged,
      agenda:
        view.agenda?.slice(0, 60).map((item) => ({
          startsAt: item.startsAt.toISOString(),
          endsAt: item.endsAt.toISOString(),
          vetName: item.vetName,
          title: item.title,
          pending: item.pending,
        })) ?? null,
      pendingAppointments: pending,
      drafts: can(actor, "followups.launch")
        ? view.views
            .filter((v) => v.status === "draft" && !v.isTest)
            .slice(0, 30)
            .map((v) => ({
              id: v.id,
              animalName: v.animalName,
              responsibleName: v.responsibleName,
            }))
        : [],
      active: view.views.filter((v) => ONGOING.has(v.status)).length,
    };
  }

  /** Suivi clinique visé, ou la réponse qui explique pourquoi il n'y en a pas. */
  function resolve(
    views: FollowupView[],
    target: Target,
    purpose: "summary" | "draft" | "status",
    change: StatusChange | null,
  ): FollowupClinical | StiveAnswer {
    if (target.kind === "one") {
      const view = views.find((v) => v.id === target.followupId);
      if (view?.access === "clinical") return view;
      return {
        kind: "unavailable",
        reason: "not_clinical",
        animalName: view?.animalName ?? null,
        change,
      };
    }
    const pool =
      target.kind === "many"
        ? views.filter((v) => target.followupIds.includes(v.id))
        : views.filter((v) => ONGOING.has(v.status));
    return {
      kind: "choose",
      purpose,
      change,
      candidates: pool
        .filter((v) => v.access === "clinical")
        .slice(0, MAX_CANDIDATES)
        .map((v) => ({
          id: v.id,
          animalName: v.animalName,
          ownerName: v.ownerName,
        })),
    };
  }

  async function summary(
    actor: Actor,
    views: FollowupView[],
    target: Target,
    options: { now: Date; locale: "fr" | "en" },
  ): Promise<Built> {
    if (!can(actor, "clinical.read"))
      return only({
        kind: "unavailable",
        reason: "not_clinical",
        animalName: null,
        change: null,
      });
    const followup = resolve(views, target, "summary", null);
    if (!("access" in followup)) return only(followup);
    const synthesis = await deps.synthesis.forFollowup(actor, followup.id, {
      language: options.locale,
      now: options.now,
    });
    return {
      answer: {
        kind: "summary",
        followup: {
          id: followup.id,
          animalName: followup.animalName,
          procedure: followup.procedure,
          dayNumber: daysSince(followup.procedureAt, options.now),
          status: followup.status,
        },
        synthesis: synthesis
          ? {
              evolution: synthesis.evolution,
              positives: synthesis.positives,
              negatives: synthesis.negatives,
              openQuestions: synthesis.openQuestions,
              withheld: synthesis.withheld,
            }
          : null,
        exchanges: synthesis?.exchanges ?? {
          ownerMessages: 0,
          photos: 0,
          voiceNotes: 0,
        },
        openAlerts:
          synthesis?.alerts.filter((alert) => alert.status !== "resolved")
            .length ?? 0,
      },
      proposals: [],
      viewed: followup.id,
    };
  }

  async function slots(
    actor: Actor,
    period: SlotPeriod,
    choice: VetChoice,
    vets: { membershipId: string; name: string }[],
  ): Promise<StiveAnswer> {
    if (!can(actor, "agenda.read"))
      return {
        kind: "unavailable",
        reason: "no_agenda",
        animalName: null,
        change: null,
      };
    const vetId =
      choice.kind === "vet"
        ? choice.membershipId
        : choice.kind === "self" &&
            vets.some((vet) => vet.membershipId === actor.membershipId)
          ? actor.membershipId
          : null;
    const from = dayStart(period.from);
    const to = dayStart(period.to);
    const free = (await deps.agenda.freeSlots(actor)).filter(
      (slot) =>
        (vetId === null || slot.membershipId === vetId) &&
        slot.startsAt >= from &&
        slot.startsAt < to,
    );
    return {
      kind: "slots",
      period: {
        label: period.label,
        from: isoDay(period.from),
        until: isoDay(period.to - 1),
      },
      vetName: vets.find((vet) => vet.membershipId === vetId)?.name ?? null,
      slots: free.slice(0, 60).map((slot) => ({
        startsAt: slot.startsAt.toISOString(),
        endsAt: slot.endsAt.toISOString(),
        vetName: slot.vetName,
      })),
    };
  }

  async function requested(
    actor: Actor,
    messageId: string,
    now: Date,
  ): Promise<Built> {
    if (!can(actor, "agenda.read"))
      return only({
        kind: "unavailable",
        reason: "no_agenda",
        animalName: null,
        change: null,
      });
    const desk = await deps.appointments.desk(actor, now);
    const proposals: Built["proposals"] = [];
    const items = desk.pending.slice(0, 30).map((pending) => {
      const card = desk.canConfirm
        ? proposal(actor, messageId, {
            kind: "appointment",
            followupId: pending.followupId,
            appointmentId: pending.id,
          })
        : null;
      if (card) proposals.push(card);
      return {
        proposalId: card?.id ?? null,
        followupId: pending.followupId,
        animalName: pending.animalName,
        vetName: pending.vetName,
        appointmentKind: pending.kind,
        startsAt: pending.startsAt.toISOString(),
        endsAt: pending.endsAt.toISOString(),
      };
    });
    return {
      answer: { kind: "appointments", items, callbacks: desk.callbacks.length },
      proposals,
    };
  }

  async function draft(
    actor: Actor,
    views: FollowupView[],
    target: Target,
    template: DraftTemplate,
    messageId: string,
  ): Promise<Built> {
    const unavailable = (
      reason: Extract<StiveAnswer, { kind: "unavailable" }>["reason"],
      animalName: string | null,
    ) => only({ kind: "unavailable", reason, animalName, change: null });
    if (!can(actor, "clinical.read")) return unavailable("not_clinical", null);
    const followup = resolve(views, target, "draft", null);
    if (!("access" in followup)) return only(followup);
    if (!can(actor, "owner_messages.reply"))
      return unavailable("cannot_write", followup.animalName);
    if (followup.status === "draft")
      return unavailable("not_launched", followup.animalName);
    if (followup.isTest)
      return unavailable("test_followup", followup.animalName);
    const view = await deps.conversations.view(actor, followup.id);
    if (!view.rights.canWrite)
      return unavailable("cannot_write", followup.animalName);
    if (!view.recipients?.length)
      return unavailable("no_consent", followup.animalName);
    const primary = view.contacts.find((contact) => contact.role === "primary");
    const names = await run(actor, async (tx) => {
      const [practice] = await tx
        .select({ name: organizations.name })
        .from(organizations);
      const [me] = await tx
        .select({ name: users.displayName })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(eq(memberships.id, actor.membershipId));
      return { practice: practice?.name ?? "", vet: me?.name ?? "" };
    });
    const card = proposal(actor, messageId, {
      kind: "message_draft",
      followupId: followup.id,
      draft: draftMessage(template, {
        language: primary?.language ?? "fr",
        recipients: view.recipients,
        vetName: names.vet,
        practiceName: names.practice,
        animalName: followup.animalName,
      }),
    });
    return {
      answer: {
        kind: "draft",
        followup: { id: followup.id, animalName: followup.animalName },
        proposalId: card.id ?? "",
        recipients: view.recipients.slice(0, 4),
      },
      proposals: [card],
    };
  }

  function status(
    actor: Actor,
    views: FollowupView[],
    target: Target,
    change: StatusChange,
    messageId: string,
  ): Built {
    if (!can(actor, "clinical.read"))
      return only({
        kind: "unavailable",
        reason: "not_clinical",
        animalName: null,
        change,
      });
    const followup = resolve(views, target, "status", change);
    if (!("access" in followup)) return only(followup);
    const refuse = (
      reason: Extract<StiveAnswer, { kind: "unavailable" }>["reason"],
    ) =>
      only({
        kind: "unavailable",
        reason,
        animalName: followup.animalName,
        change,
      });
    if (!canSteerFollowup(actor, followup.access))
      return refuse("cannot_steer");
    if (followup.status === "draft") return refuse("not_launched");
    if (!TRANSITIONS[change].from.includes(followup.status))
      return refuse("same_status");
    const card = proposal(actor, messageId, {
      kind: "followup_status",
      followupId: followup.id,
      change,
    });
    return {
      answer: {
        kind: "status",
        followup: { id: followup.id, animalName: followup.animalName },
        proposalId: card.id ?? "",
        change,
      },
      proposals: [card],
    };
  }

  async function answer(
    actor: Actor,
    request: StiveRequest,
    context: {
      views: FollowupView[];
      vets: { membershipId: string; name: string }[];
      messageId: string;
      now: Date;
      locale: "fr" | "en";
    },
  ): Promise<Built> {
    const { views, vets, messageId, now, locale } = context;
    switch (request.kind) {
      case "briefing":
        return only(await briefing(actor, now));
      case "summary":
        return summary(actor, views, request.target, { now, locale });
      case "slots":
        return only(await slots(actor, request.period, request.vet, vets));
      case "appointments":
        return requested(actor, messageId, now);
      case "draft":
        return draft(actor, views, request.target, request.template, messageId);
      case "status":
        return status(actor, views, request.target, request.change, messageId);
      default:
        return only({ kind: "unknown" });
    }
  }

  return {
    /** Échanges des 30 derniers jours de la personne, tels qu'elle peut encore les voir. */
    async conversation(
      actor: Actor,
      now = new Date(),
    ): Promise<StiveConversation> {
      assertPermission(actor, "stive.use");
      return run(actor, async (tx) => {
        const since = new Date(now.getTime() - STIVE_RETENTION_DAYS * DAY_MS);
        const rows = (
          await tx
            .select()
            .from(stiveMessages)
            .where(
              and(
                eq(stiveMessages.membershipId, actor.membershipId),
                gt(stiveMessages.createdAt, since),
              ),
            )
            .orderBy(desc(stiveMessages.createdAt))
            .limit(MAX_MESSAGES)
        ).reverse();

        const answers = new Map<string, StiveAnswer>();
        for (const row of rows) {
          const parsed = stiveAnswer.safeParse(row.answer);
          if (row.author === "stive" && parsed.success)
            answers.set(row.id, parsed.data);
        }
        const cited = [
          ...new Set(
            [...answers.values()].flatMap((a) =>
              followupsOf(a).map((f) => f.id),
            ),
          ),
        ];
        const facts = cited.length
          ? await tx
              .select({
                id: followups.id,
                responsibleMembershipId: followups.responsibleMembershipId,
                isPrivate: followups.isPrivate,
              })
              .from(followups)
              .where(inArray(followups.id, cited))
          : [];
        const access = await followupAccessMap(tx, actor, facts);

        const proposalRows = rows.length
          ? await tx
              .select({
                id: stiveProposals.id,
                kind: stiveProposals.kind,
                status: stiveProposals.status,
                outcome: stiveProposals.outcome,
                draft: stiveProposals.draft,
              })
              .from(stiveProposals)
              .where(
                inArray(
                  stiveProposals.messageId,
                  rows.map((row) => row.id),
                ),
              )
          : [];

        const { limit } = await monthlyLimit(tx);
        const [usage] = await tx
          .select({ requests: stiveUsage.requests })
          .from(stiveUsage)
          .where(
            and(
              eq(stiveUsage.membershipId, actor.membershipId),
              eq(stiveUsage.month, parisMonth(now)),
            ),
          );

        const rights = {
          clinical: can(actor, "clinical.read"),
          agenda: can(actor, "agenda.read"),
          launch: can(actor, "followups.launch"),
        };
        return {
          entries: rows.map((row): StiveEntry => {
            if (row.author === "member")
              return {
                id: row.id,
                author: "member",
                at: row.createdAt,
                question: row.question ?? "",
              };
            const parsed = answers.get(row.id);
            return {
              id: row.id,
              author: "stive",
              at: row.createdAt,
              answer: parsed ? visibleAnswer(parsed, access, rights) : null,
            };
          }),
          proposals: Object.fromEntries(
            proposalRows.map((row) => [row.id, row]),
          ),
          usage: { used: usage?.requests ?? 0, limit },
        };
      });
    },

    /**
     * Une demande à Stive : comptée, reconnue, puis enregistrée avec sa réponse et ses
     * propositions. Renvoie la réponse (déjà enregistrée).
     */
    async ask(
      actor: Actor,
      input: { question: unknown; followupId?: unknown },
      options: { now?: Date; locale?: "fr" | "en" } = {},
    ): Promise<StiveAnswer> {
      assertPermission(actor, "stive.use");
      const question = stiveQuestion.safeParse(input.question);
      if (!question.success) throw new DomainError("invalid_target");
      const contextId =
        input.followupId === undefined || input.followupId === ""
          ? undefined
          : uuid.safeParse(input.followupId);
      if (contextId && !contextId.success)
        throw new DomainError("invalid_target");
      const now = options.now ?? new Date();
      const locale = options.locale ?? "fr";

      const quota = await run(actor, async (tx) => {
        const { plan, limit } = await monthlyLimit(tx);
        return {
          plan,
          limit,
          counted: await countRequest(tx, actor, limit, now),
          vets: await vetsOf(tx),
        };
      });

      const messageId = randomUUID();
      let built: Built;
      if (!quota.counted)
        built = only({
          kind: "limit",
          limit: quota.limit,
          resetsOn: nextParisMonth(now),
          upgrade: (quota.plan ?? "premium") !== "premium",
        });
      else {
        const views = await deps.followups.list(actor);
        const request = recognize(question.data, {
          followups: views,
          vets: quota.vets,
          isVet: VET_ROLES.has(actor.role),
          followupId: contextId?.data,
          today: parisDayIndex(now),
        });
        try {
          built = await answer(actor, request, {
            views,
            vets: quota.vets,
            messageId,
            now,
            locale,
          });
        } catch (error) {
          // Dossier devenu inaccessible entre-temps : même réponse qu'un dossier inexistant.
          if (!(error instanceof DomainError) || error.code !== "not_found")
            throw error;
          built = only({
            kind: "unavailable",
            reason: "not_clinical",
            animalName: null,
            change: null,
          });
        }
      }

      const saved = stiveAnswer.parse(built.answer);
      await run(actor, async (tx) => {
        await tx.insert(stiveMessages).values([
          {
            organizationId: actor.organizationId,
            membershipId: actor.membershipId,
            author: "member",
            question: question.data,
            createdAt: now,
          },
          {
            id: messageId,
            organizationId: actor.organizationId,
            membershipId: actor.membershipId,
            author: "stive",
            answer: saved,
            createdAt: new Date(now.getTime() + 1),
          },
        ]);
        if (built.proposals.length)
          await tx.insert(stiveProposals).values(built.proposals);
        // Consultation du détail d'un dossier : tracée comme à l'écran, sans la question.
        if (built.viewed)
          await auditFollowup(tx, actor, "followup.viewed", built.viewed, {
            access: "clinical",
            via: "stive",
          });
      });
      return saved;
    },

    /**
     * Clic sur une carte « À confirmer » : exécute l'action de l'écran concerné (mêmes
     * vérifications de droits), puis note au journal qu'elle a été préparée par Stive. Une
     * carte dépassée (rendez-vous déjà traité, suivi changé, accès retiré) est close.
     */
    async decide(
      actor: Actor,
      proposalId: string,
      decision: StiveDecision,
      now = new Date(),
    ): Promise<StiveOutcome> {
      assertPermission(actor, "stive.use");
      if (!uuid.safeParse(proposalId).success)
        throw new DomainError("not_found");
      const [card] = await run(actor, (tx) =>
        tx
          .select()
          .from(stiveProposals)
          .where(
            and(
              eq(stiveProposals.id, proposalId),
              eq(stiveProposals.membershipId, actor.membershipId),
            ),
          ),
      );
      if (!card || card.kind === "message_draft")
        throw new DomainError("not_found");
      if (card.status !== "open") throw new DomainError("invalid_transition");

      let outcome: StiveOutcome;
      let action: string;
      try {
        if (card.kind === "appointment" && card.appointmentId) {
          if (decision === "confirm") {
            await deps.appointments.confirm(actor, card.appointmentId);
            outcome = "confirmed";
            action = "appointment.confirmed";
          } else {
            await deps.appointments.decline(actor, card.appointmentId);
            outcome = "declined";
            action = "appointment.declined";
          }
        } else if (card.change && decision === "confirm") {
          await deps.launch.changeStatus(
            actor,
            card.followupId,
            card.change,
            now,
          );
          outcome = OUTCOMES[card.change];
          action = TRANSITIONS[card.change].action;
        } else throw new DomainError("invalid_target");
      } catch (error) {
        if (
          error instanceof DomainError &&
          (error.code === "invalid_transition" || error.code === "not_found")
        )
          await run(actor, (tx) =>
            tx
              .update(stiveProposals)
              .set({ status: "expired", decidedAt: now })
              .where(
                and(
                  eq(stiveProposals.id, card.id),
                  eq(stiveProposals.status, "open"),
                ),
              ),
          );
        throw error;
      }

      await run(actor, async (tx) => {
        await tx
          .update(stiveProposals)
          .set({ status: "done", outcome, decidedAt: now })
          .where(
            and(
              eq(stiveProposals.id, card.id),
              eq(stiveProposals.status, "open"),
            ),
          );
        await auditFollowup(
          tx,
          actor,
          "stive.action_confirmed",
          card.followupId,
          {
            proposalId: card.id,
            action,
          },
        );
      });
      return outcome;
    },

    /** Brouillon préparé par Stive pour ce dossier, à poser dans la zone de saisie. */
    async draftFor(
      actor: Actor,
      proposalId: string,
      followupId: string,
    ): Promise<string | null> {
      if (!actor.permissions.has("stive.use")) return null;
      if (
        !uuid.safeParse(proposalId).success ||
        !uuid.safeParse(followupId).success
      )
        return null;
      const [row] = await run(actor, (tx) =>
        tx
          .select({ draft: stiveProposals.draft })
          .from(stiveProposals)
          .where(
            and(
              eq(stiveProposals.id, proposalId),
              eq(stiveProposals.membershipId, actor.membershipId),
              eq(stiveProposals.followupId, followupId),
              eq(stiveProposals.kind, "message_draft"),
            ),
          ),
      );
      return row?.draft ?? null;
    },

    /** « Effacer la conversation » : les échanges de la personne, et eux seuls. */
    async clear(actor: Actor): Promise<number> {
      return run(actor, async (tx) => {
        const removed = await tx
          .delete(stiveMessages)
          .where(eq(stiveMessages.membershipId, actor.membershipId))
          .returning({ id: stiveMessages.id });
        if (removed.length)
          await auditOrganization(tx, actor, "stive.conversation_cleared", {
            messages: removed.length,
          });
        return removed.length;
      });
    },

    /**
     * Point du jour du tableau de bord : ni compté, ni enregistré. `today` : la vue que le
     * tableau de bord a déjà lue, pour ne pas la relire.
     */
    async briefing(
      actor: Actor,
      now = new Date(),
      today?: TodayView,
    ): Promise<StiveBriefing> {
      assertPermission(actor, "stive.use");
      return briefing(actor, now, today);
    },
  };
}
