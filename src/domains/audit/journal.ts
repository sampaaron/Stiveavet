import type { Actor } from "@/domains/equipe/actor";
import type { TenantTransaction } from "@/server/db/tenant";

import { auditEvents } from "./schema";
import type { AuditMetadata } from "./schema";

/**
 * Journal d'activité : une ligne par action, avec son auteur (null pour Numa ou une tâche),
 * sa cible et des métadonnées techniques seulement, jamais de contenu clinique. La base
 * l'interdit en modification et en suppression.
 */

type Author = Pick<Actor, "organizationId"> & { membershipId: string | null };

export function recordAudit(
  tx: TenantTransaction,
  author: Author,
  action: string,
  target: { type: string; id: string },
  metadata: AuditMetadata = {},
) {
  return tx.insert(auditEvents).values({
    organizationId: author.organizationId,
    actorMembershipId: author.membershipId,
    action,
    targetType: target.type,
    targetId: target.id,
    metadata,
  });
}

export const auditFollowup = (
  tx: TenantTransaction,
  author: Author,
  action: string,
  followupId: string,
  metadata: AuditMetadata = {},
) =>
  recordAudit(
    tx,
    author,
    action,
    { type: "followup", id: followupId },
    metadata,
  );

export const auditOrganization = (
  tx: TenantTransaction,
  author: Author,
  action: string,
  metadata: AuditMetadata = {},
) =>
  recordAudit(
    tx,
    author,
    action,
    { type: "organization", id: author.organizationId },
    metadata,
  );

export const auditProtocol = (
  tx: TenantTransaction,
  author: Author,
  action: string,
  protocolId: string,
  metadata: AuditMetadata = {},
) =>
  recordAudit(
    tx,
    author,
    action,
    { type: "protocol", id: protocolId },
    metadata,
  );

export const auditAttachment = (
  tx: TenantTransaction,
  author: Author,
  action: string,
  attachmentId: string,
  metadata: AuditMetadata = {},
) =>
  recordAudit(
    tx,
    author,
    action,
    { type: "attachment", id: attachmentId },
    metadata,
  );

/** Auteur d'une action de Numa ou d'une tâche de fond : aucun membre n'en est l'auteur. */
export const systemAuthor = (organizationId: string): Author => ({
  organizationId,
  membershipId: null,
});
