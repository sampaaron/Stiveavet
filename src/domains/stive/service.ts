import { and, asc, desc, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { STIVE_TURNS_SENT } from "@/adapters/ai-gateway/api-compatible";
import type { AiGateway, StiveCase } from "@/adapters/ai-gateway/types";
import { rateLimitBucket } from "@/domains/auth/tokens";
import { DomainError, assertPermission } from "@/domains/equipe/actor";
import type { Actor } from "@/domains/equipe/actor";
import type { FollowupsService } from "@/domains/suivis/service";
import { stiveConversations, stiveMessages } from "@/server/db/schema";
import { tenantRunner } from "@/server/db/tenant";
import type { Database, TenantTransaction } from "@/server/db/tenant";

import {
  buildStiveCase,
  conversationTitle,
  detectFollowup,
  stiveMessageInput,
} from "./contexte";
import type { StiveFollowupChoice } from "./contexte";

/**
 * Stive, l'assistant IA interne du vétérinaire (ADR 0035). Chaque appel exige `stive.use` ;
 * le dossier évoqué n'est lu qu'à travers le service des suivis, donc avec la RLS, la règle
 * d'accès au dossier (responsable, partage, dossier privé) et l'accès clinique de la
 * personne ; cette lecture est journalisée comme toute consultation. Aucun texte de la
 * conversation n'est journalisé.
 */

/** Débit : 30 messages par tranche de 10 minutes et 300 par jour, par membre. */
const RATE_LIMITS = [
  ["stivePerMember", "10 minutes", 30],
  ["stiveDailyPerMember", "1 day", 300],
] as const;

const REPLY_MAX = 4000;
const CONVERSATIONS_LISTED = 30;
const MESSAGES_SHOWN = 200;

const idSchema = z.uuid();

export type StiveConversationSummary = {
  id: string;
  title: string;
  updatedAt: Date;
};

export type StiveMessageView = {
  id: string;
  author: "vet" | "stive";
  body: string;
  followupId: string | null;
  createdAt: Date;
};

export type StiveConversationView = {
  id: string;
  title: string;
  followupId: string | null;
  messages: StiveMessageView[];
};

export type StiveAskInput = {
  conversationId: string | null;
  message: string;
  followup: StiveFollowupChoice;
  language: "fr" | "en";
};

export type StiveAskResult =
  | { status: "rate_limited" }
  | { status: "unavailable" }
  | {
      status: "answered";
      conversationId: string;
      /** Dossier sur lequel la réponse s'est appuyée. */
      followupId: string | null;
      /** Plusieurs animaux cités correspondent : aucun dossier n'a été pris. */
      ambiguous: string[] | null;
    };

export function stiveService(deps: {
  db: Database;
  ai: AiGateway;
  followups: FollowupsService;
  now?: () => Date;
}) {
  const run = tenantRunner(deps.db);
  const now = deps.now ?? (() => new Date());

  async function loadConversation(tx: TenantTransaction, id: string) {
    const [conversation] = await tx
      .select({
        id: stiveConversations.id,
        title: stiveConversations.title,
        followupId: stiveConversations.followupId,
      })
      .from(stiveConversations)
      .where(eq(stiveConversations.id, id));
    return conversation ?? null;
  }

  async function withinRateLimits(actor: Actor): Promise<boolean> {
    return run(actor, async (tx) => {
      for (const [name, window, max] of RATE_LIMITS) {
        const result = await tx.execute<{ allowed: boolean }>(
          sql`SELECT auth.hit_rate_limit(${rateLimitBucket(name, actor.membershipId)}, ${window}::interval, ${max}) AS allowed`,
        );
        if (result.rows[0]?.allowed !== true) return false;
      }
      return true;
    });
  }

  /** Dossier retenu pour ce message, puis son contenu réduit (null : aucun ou inaccessible). */
  async function caseFor(
    actor: Actor,
    input: StiveAskInput,
    previous: string | null,
  ): Promise<{
    followupId: string | null;
    file: StiveCase | null;
    ambiguous: string[] | null;
  }> {
    let followupId: string | null = null;
    let ambiguous: string[] | null = null;
    if (input.followup === "none") followupId = null;
    else if (input.followup !== "auto") followupId = input.followup;
    else {
      const visible = await deps.followups.list(actor);
      const detection = detectFollowup(input.message, visible);
      if (detection.kind === "one") followupId = detection.followupId;
      else if (detection.kind === "ambiguous")
        ambiguous = detection.animalNames;
      else followupId = previous;
    }
    if (!followupId) return { followupId: null, file: null, ambiguous };
    const opened = await deps.followups.open(actor, followupId);
    if (!opened) return { followupId: null, file: null, ambiguous };
    return {
      followupId,
      file: buildStiveCase(opened.followup, opened.record, now()),
      ambiguous,
    };
  }

  return {
    /** Passerelle simulée (poste local) : l'écran l'annonce. */
    simulated: deps.ai.simulated,

    /** Conversations de la personne, la plus récente d'abord. */
    async conversations(actor: Actor): Promise<StiveConversationSummary[]> {
      assertPermission(actor, "stive.use");
      return run(actor, (tx) =>
        tx
          .select({
            id: stiveConversations.id,
            title: stiveConversations.title,
            updatedAt: stiveConversations.updatedAt,
          })
          .from(stiveConversations)
          .where(eq(stiveConversations.membershipId, actor.membershipId))
          .orderBy(desc(stiveConversations.updatedAt))
          .limit(CONVERSATIONS_LISTED),
      );
    },

    /** Une conversation et ses messages ; null si elle n'existe pas pour cette personne. */
    async conversation(
      actor: Actor,
      id: string,
    ): Promise<StiveConversationView | null> {
      assertPermission(actor, "stive.use");
      if (!idSchema.safeParse(id).success) return null;
      return run(actor, async (tx) => {
        const conversation = await loadConversation(tx, id);
        if (!conversation) return null;
        const messages = await tx
          .select({
            id: stiveMessages.id,
            author: stiveMessages.author,
            body: stiveMessages.body,
            followupId: stiveMessages.followupId,
            createdAt: stiveMessages.createdAt,
          })
          .from(stiveMessages)
          .where(eq(stiveMessages.conversationId, id))
          .orderBy(asc(stiveMessages.createdAt))
          .limit(MESSAGES_SHOWN);
        return { ...conversation, messages };
      });
    },

    /**
     * Message du vétérinaire et réponse de Stive. Rien n'est enregistré si Stive ne répond
     * pas : le message reste à renvoyer, sans trace partielle.
     */
    async ask(actor: Actor, input: StiveAskInput): Promise<StiveAskResult> {
      assertPermission(actor, "stive.use");
      const message = stiveMessageInput.parse(input.message);
      if (
        input.conversationId !== null &&
        !idSchema.safeParse(input.conversationId).success
      )
        throw new DomainError("not_found");

      const previous = input.conversationId
        ? await run(actor, async (tx) => {
            const conversation = await loadConversation(
              tx,
              input.conversationId ?? "",
            );
            if (!conversation) return null;
            const turns = await tx
              .select({
                author: stiveMessages.author,
                body: stiveMessages.body,
              })
              .from(stiveMessages)
              .where(eq(stiveMessages.conversationId, conversation.id))
              .orderBy(desc(stiveMessages.createdAt))
              .limit(STIVE_TURNS_SENT - 1);
            return { conversation, turns: turns.reverse() };
          })
        : null;
      if (input.conversationId && !previous) throw new DomainError("not_found");

      if (!(await withinRateLimits(actor))) return { status: "rate_limited" };

      const context = await caseFor(
        actor,
        { ...input, message },
        previous?.conversation.followupId ?? null,
      );

      let reply: string;
      try {
        const answer = await deps.ai.stiveChat({
          language: input.language,
          turns: [
            ...(previous?.turns ?? []).map((turn) => ({
              from: turn.author,
              text: turn.body,
            })),
            { from: "vet" as const, text: message },
          ],
          case: context.file,
        });
        reply = answer.text.trim().slice(0, REPLY_MAX);
      } catch {
        // Ni le texte ni l'erreur du fournisseur ne sont gardés.
        return { status: "unavailable" };
      }
      if (!reply) return { status: "unavailable" };

      const conversationId = await run(actor, async (tx) => {
        let id = previous?.conversation.id;
        if (id) {
          await tx
            .update(stiveConversations)
            .set({ followupId: context.followupId })
            .where(
              and(
                eq(stiveConversations.id, id),
                eq(stiveConversations.membershipId, actor.membershipId),
              ),
            );
        } else {
          const [created] = await tx
            .insert(stiveConversations)
            .values({
              organizationId: actor.organizationId,
              membershipId: actor.membershipId,
              title: conversationTitle(message),
              followupId: context.followupId,
            })
            .returning({ id: stiveConversations.id });
          if (!created) throw new Error("Conversation non enregistrée");
          id = created.id;
        }
        await tx.insert(stiveMessages).values({
          organizationId: actor.organizationId,
          conversationId: id,
          author: "vet",
          body: message,
          followupId: context.followupId,
        });
        await tx.insert(stiveMessages).values({
          organizationId: actor.organizationId,
          conversationId: id,
          author: "stive",
          body: reply,
          followupId: context.followupId,
        });
        return id;
      });

      return {
        status: "answered",
        conversationId,
        followupId: context.followupId,
        ambiguous: context.ambiguous,
      };
    },

    /** Efface une conversation et ses messages ; false si elle n'existe pas pour la personne. */
    async remove(actor: Actor, id: string): Promise<boolean> {
      assertPermission(actor, "stive.use");
      if (!idSchema.safeParse(id).success) return false;
      return run(actor, async (tx) => {
        const deleted = await tx
          .delete(stiveConversations)
          .where(
            and(
              eq(stiveConversations.id, id),
              eq(stiveConversations.membershipId, actor.membershipId),
            ),
          )
          .returning({ id: stiveConversations.id });
        return deleted.length > 0;
      });
    },
  };
}

export type StiveService = ReturnType<typeof stiveService>;
