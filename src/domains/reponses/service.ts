import { asc, count, eq } from "drizzle-orm";
import { z } from "zod";

import { recordAudit } from "@/domains/audit/journal";
import { DomainError, assertPermission } from "@/domains/commun/actor";
import type { Actor } from "@/domains/commun/actor";
import { memberships, users } from "@/server/db/schema";
import { tenantRunner } from "@/server/db/tenant";
import type { Database } from "@/server/db/tenant";

import { replyTemplates } from "./schema";

/**
 * Modèles de réponse du cabinet (ADR 0048). L'équipe qui répond aux propriétaires les pose
 * dans la zone de saisie d'un dossier, les relit et les envoie elle-même : un modèle ne part
 * jamais seul. L'administrateur du cabinet les écrit. Le journal garde qui a ajouté, modifié
 * ou supprimé un modèle, jamais son texte.
 */

/** Plafond par cabinet : une courte liste se parcourt d'un coup d'œil. */
export const MAX_TEMPLATES = 30;

export const templateInput = z.object({
  title: z.string().trim().min(1).max(60),
  body: z.string().trim().min(1).max(1000),
  language: z.enum(["fr", "en"]),
});
export type TemplateInput = z.infer<typeof templateInput>;

export type ReplyTemplateView = TemplateInput & {
  id: string;
  updatedAt: Date;
  createdBy: string | null;
};

const MANAGER = "organization.settings";

/** Lus par qui répond aux propriétaires et par l'administrateur qui les écrit. */
function canRead(actor: Actor): boolean {
  return (
    actor.permissions.has("owner_messages.reply") ||
    actor.permissions.has(MANAGER)
  );
}

function parse(raw: unknown): TemplateInput {
  const parsed = templateInput.safeParse(raw);
  if (!parsed.success) throw new DomainError("invalid_target");
  return parsed.data;
}

function templateId(raw: string): string {
  if (!z.uuid().safeParse(raw).success) throw new DomainError("not_found");
  return raw;
}

export function replyTemplatesService(db: Database) {
  const run = tenantRunner(db);

  return {
    /** Tous les modèles du cabinet, par langue puis par titre. */
    async list(actor: Actor): Promise<ReplyTemplateView[]> {
      if (!canRead(actor)) throw new DomainError("not_found");
      const rows = await run(actor, (tx) =>
        tx
          .select({
            id: replyTemplates.id,
            title: replyTemplates.title,
            body: replyTemplates.body,
            language: replyTemplates.language,
            updatedAt: replyTemplates.updatedAt,
            createdBy: users.displayName,
          })
          .from(replyTemplates)
          .leftJoin(
            memberships,
            eq(memberships.id, replyTemplates.createdByMembershipId),
          )
          .leftJoin(users, eq(users.id, memberships.userId))
          .orderBy(asc(replyTemplates.language), asc(replyTemplates.title))
          .limit(MAX_TEMPLATES),
      );
      return rows;
    },

    async create(actor: Actor, raw: unknown): Promise<string> {
      assertPermission(actor, MANAGER);
      const input = parse(raw);
      return run(actor, async (tx) => {
        const [current] = await tx.select({ n: count() }).from(replyTemplates);
        if ((current?.n ?? 0) >= MAX_TEMPLATES)
          throw new DomainError("template_limit");
        const [row] = await tx
          .insert(replyTemplates)
          .values({
            organizationId: actor.organizationId,
            ...input,
            createdByMembershipId: actor.membershipId,
          })
          .returning({ id: replyTemplates.id });
        if (!row) throw new Error("Modèle non enregistré");
        await recordAudit(
          tx,
          actor,
          "reply_template.created",
          { type: "reply_template", id: row.id },
          { language: input.language },
        );
        return row.id;
      });
    },

    async update(actor: Actor, id: string, raw: unknown): Promise<void> {
      assertPermission(actor, MANAGER);
      const target = templateId(id);
      const input = parse(raw);
      await run(actor, async (tx) => {
        const [row] = await tx
          .update(replyTemplates)
          .set({ ...input, updatedAt: new Date() })
          .where(eq(replyTemplates.id, target))
          .returning({ id: replyTemplates.id });
        if (!row) throw new DomainError("not_found");
        await recordAudit(
          tx,
          actor,
          "reply_template.updated",
          { type: "reply_template", id: target },
          { language: input.language },
        );
      });
    },

    async remove(actor: Actor, id: string): Promise<void> {
      assertPermission(actor, MANAGER);
      const target = templateId(id);
      await run(actor, async (tx) => {
        const [row] = await tx
          .delete(replyTemplates)
          .where(eq(replyTemplates.id, target))
          .returning({ id: replyTemplates.id });
        if (!row) throw new DomainError("not_found");
        await recordAudit(tx, actor, "reply_template.removed", {
          type: "reply_template",
          id: target,
        });
      });
    },
  };
}

export type ReplyTemplatesService = ReturnType<typeof replyTemplatesService>;
