import { randomUUID } from "node:crypto";

import { and, asc, count, desc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";

import type { AuditMetadata } from "@/domains/audit/schema";
import { DomainError } from "@/domains/equipe/actor";
import type { Actor } from "@/domains/equipe/actor";
import {
  alertRules,
  auditEvents,
  followups,
  memberships,
  protocolSteps,
  protocolVersions,
  protocols,
  users,
} from "@/server/db/schema";
import { withTenant } from "@/server/db/tenant";
import type { Database, TenantTransaction } from "@/server/db/tenant";

import { protocolContentInput } from "./content";
import type { ProtocolContent } from "./content";
import { PROTOCOL_LIBRARY, libraryProtocol } from "./library";
import {
  canBrowseProtocols,
  canCreateProtocol,
  canEditProtocol,
  canReadProtocol,
  canValidateProtocol,
} from "./policies";
import type { ProtocolScope } from "./policies";

export type ProtocolSummary = {
  id: string;
  name: string;
  category: ProtocolContent["category"];
  species: ProtocolContent["species"];
  versionNumber: number;
  validated: boolean;
  fromLibrary: boolean;
  ownerMembershipId: string | null;
  ownerName: string | null;
  archived: boolean;
  followupCount: number;
};

export type ProtocolVersionEntry = {
  id: string;
  versionNumber: number;
  createdAt: Date;
  createdByName: string;
  changeNote: string;
  validatedByName: string | null;
  validatedAt: Date | null;
  followupCount: number;
};

export type ProtocolDetail = {
  id: string;
  ownerMembershipId: string | null;
  ownerName: string | null;
  fromLibrary: boolean;
  archived: boolean;
  isCurrent: boolean;
  version: ProtocolVersionEntry & { content: ProtocolContent };
  versions: ProtocolVersionEntry[];
  can: {
    edit: boolean;
    archive: boolean;
    validate: boolean;
    duplicateToCabinet: boolean;
    duplicateToPersonal: boolean;
  };
};

const uuid = z.uuid();

function audit(
  tx: TenantTransaction,
  actor: Actor,
  action: string,
  protocolId: string,
  metadata: AuditMetadata = {},
) {
  return tx.insert(auditEvents).values({
    organizationId: actor.organizationId,
    actorMembershipId: actor.membershipId,
    action,
    targetType: "protocol",
    targetId: protocolId,
    metadata,
  });
}

/** Écrit une version complète (contenu, étapes, signes d'alerte) ; elle ne changera plus. */
async function writeVersion(
  tx: TenantTransaction,
  actor: Actor,
  input: {
    protocolId: string;
    versionNumber: number;
    content: ProtocolContent;
    changeNote: string;
    validated: boolean;
  },
) {
  const versionId = randomUUID();
  const now = new Date();
  await tx.insert(protocolVersions).values({
    id: versionId,
    organizationId: actor.organizationId,
    protocolId: input.protocolId,
    versionNumber: input.versionNumber,
    name: input.content.name,
    category: input.content.category,
    species: input.content.species,
    description: input.content.description,
    durationDays: input.content.durationDays,
    changeNote: input.changeNote,
    createdByMembershipId: actor.membershipId,
    validatedByMembershipId: input.validated ? actor.membershipId : null,
    validatedAt: input.validated ? now : null,
  });
  await tx.insert(protocolSteps).values(
    [...input.content.steps]
      .sort((a, b) => a.offsetHours - b.offsetHours)
      .map((step, index) => ({
        organizationId: actor.organizationId,
        protocolVersionId: versionId,
        position: index + 1,
        offsetHours: step.offsetHours,
        kind: step.kind,
        content: step.content,
      })),
  );
  await tx.insert(alertRules).values(
    input.content.alerts.map((alert, index) => ({
      organizationId: actor.organizationId,
      protocolVersionId: versionId,
      position: index + 1,
      level: alert.level,
      description: alert.description,
    })),
  );
  await tx
    .update(protocols)
    .set({ currentVersionId: versionId })
    .where(eq(protocols.id, input.protocolId));
  return versionId;
}

async function readContent(
  tx: TenantTransaction,
  versionId: string,
): Promise<ProtocolContent | null> {
  const [version] = await tx
    .select()
    .from(protocolVersions)
    .where(eq(protocolVersions.id, versionId));
  if (!version) return null;
  const steps = await tx
    .select()
    .from(protocolSteps)
    .where(eq(protocolSteps.protocolVersionId, versionId))
    .orderBy(asc(protocolSteps.position));
  const alerts = await tx
    .select()
    .from(alertRules)
    .where(eq(alertRules.protocolVersionId, versionId))
    .orderBy(asc(alertRules.position));
  return {
    name: version.name,
    category: version.category,
    species: version.species,
    description: version.description,
    durationDays: version.durationDays,
    steps: steps.map((step) => ({
      offsetHours: step.offsetHours,
      kind: step.kind,
      content: step.content,
    })),
    alerts: alerts.map((alert) => ({
      level: alert.level,
      description: alert.description,
    })),
  };
}

async function memberNames(tx: TenantTransaction) {
  const rows = await tx
    .select({ id: memberships.id, name: users.displayName })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId));
  return new Map(rows.map((row) => [row.id, row.name]));
}

/** Nombre de suivis rattachés à chaque version. */
async function followupCounts(tx: TenantTransaction) {
  const rows = await tx
    .select({ versionId: followups.protocolVersionId, n: count() })
    .from(followups)
    .where(isNotNull(followups.protocolVersionId))
    .groupBy(followups.protocolVersionId);
  const result = new Map<string, number>();
  for (const row of rows) if (row.versionId) result.set(row.versionId, row.n);
  return result;
}

function parseContent(content: unknown): ProtocolContent {
  const parsed = protocolContentInput.safeParse(content);
  if (!parsed.success) throw new DomainError("invalid_target");
  return parsed.data;
}

const changeNoteSchema = z.string().trim().max(500);

export function protocolsService(db: Database) {
  const run = <T>(actor: Actor, fn: (tx: TenantTransaction) => Promise<T>) =>
    withTenant(
      db,
      { organizationId: actor.organizationId, userId: actor.userId },
      fn,
    );

  /** Protocole lisible par l'acteur, sinon « inexistant » (404). */
  async function loadReadable(
    tx: TenantTransaction,
    actor: Actor,
    protocolId: string,
    lock = false,
  ) {
    if (!uuid.safeParse(protocolId).success) throw new DomainError("not_found");
    const query = tx
      .select()
      .from(protocols)
      .where(eq(protocols.id, protocolId));
    const [protocol] = lock ? await query.for("update") : await query;
    if (!protocol || !canReadProtocol(actor, protocol))
      throw new DomainError("not_found");
    return protocol;
  }

  async function loadEditable(
    tx: TenantTransaction,
    actor: Actor,
    protocolId: string,
  ) {
    const protocol = await loadReadable(tx, actor, protocolId, true);
    if (!canEditProtocol(actor, protocol)) throw new DomainError("forbidden");
    return protocol;
  }

  async function nextVersionNumber(tx: TenantTransaction, protocolId: string) {
    const [last] = await tx
      .select({ n: protocolVersions.versionNumber })
      .from(protocolVersions)
      .where(eq(protocolVersions.protocolId, protocolId))
      .orderBy(desc(protocolVersions.versionNumber))
      .limit(1);
    return (last?.n ?? 0) + 1;
  }

  async function createProtocol(
    tx: TenantTransaction,
    actor: Actor,
    input: {
      scope: ProtocolScope;
      content: ProtocolContent;
      libraryKey?: string;
      duplicatedFromVersionId?: string;
      validated: boolean;
      changeNote: string;
    },
  ) {
    const id = randomUUID();
    await tx.insert(protocols).values({
      id,
      organizationId: actor.organizationId,
      ownerMembershipId: input.scope === "personal" ? actor.membershipId : null,
      libraryKey: input.libraryKey ?? null,
      duplicatedFromVersionId: input.duplicatedFromVersionId ?? null,
      createdByMembershipId: actor.membershipId,
    });
    await writeVersion(tx, actor, {
      protocolId: id,
      versionNumber: 1,
      content: input.content,
      changeNote: input.changeNote,
      validated: input.validated,
    });
    return id;
  }

  return {
    /** Protocoles visibles, et modèles de la bibliothèque pas encore ajoutés au cabinet. */
    async list(actor: Actor) {
      if (!canBrowseProtocols(actor)) throw new DomainError("not_found");
      return run(actor, async (tx) => {
        const rows = await tx
          .select({
            id: protocols.id,
            ownerMembershipId: protocols.ownerMembershipId,
            libraryKey: protocols.libraryKey,
            archivedAt: protocols.archivedAt,
            name: protocolVersions.name,
            category: protocolVersions.category,
            species: protocolVersions.species,
            versionNumber: protocolVersions.versionNumber,
            validatedAt: protocolVersions.validatedAt,
          })
          .from(protocols)
          .innerJoin(
            protocolVersions,
            eq(protocolVersions.id, protocols.currentVersionId),
          )
          .orderBy(asc(protocolVersions.name));
        const names = await memberNames(tx);
        const counts = await followupCounts(tx);
        const versions = await tx
          .select({
            id: protocolVersions.id,
            protocolId: protocolVersions.protocolId,
          })
          .from(protocolVersions);
        const usage = new Map<string, number>();
        for (const version of versions)
          usage.set(
            version.protocolId,
            (usage.get(version.protocolId) ?? 0) +
              (counts.get(version.id) ?? 0),
          );

        const visible: ProtocolSummary[] = rows
          .filter((row) => canReadProtocol(actor, row))
          .map((row) => ({
            id: row.id,
            name: row.name,
            category: row.category,
            species: row.species,
            versionNumber: row.versionNumber,
            validated: row.validatedAt !== null,
            fromLibrary: row.libraryKey !== null,
            ownerMembershipId: row.ownerMembershipId,
            ownerName: row.ownerMembershipId
              ? (names.get(row.ownerMembershipId) ?? null)
              : null,
            archived: row.archivedAt !== null,
            followupCount: usage.get(row.id) ?? 0,
          }));
        const installed = new Set(rows.map((row) => row.libraryKey));
        const library = actor.permissions.has("protocols.manage")
          ? PROTOCOL_LIBRARY.filter((entry) => !installed.has(entry.key)).map(
              (entry) => ({
                key: entry.key,
                name: entry.name,
                category: entry.category,
                species: entry.species,
                description: entry.description,
              }),
            )
          : [];
        return { protocols: visible, library };
      });
    },

    /** Version courante (ou numéro demandé), historique et actions possibles. */
    async get(
      actor: Actor,
      protocolId: string,
      versionNumber?: number,
    ): Promise<ProtocolDetail> {
      return run(actor, async (tx) => {
        const protocol = await loadReadable(tx, actor, protocolId);
        const names = await memberNames(tx);
        const counts = await followupCounts(tx);
        const rows = await tx
          .select()
          .from(protocolVersions)
          .where(eq(protocolVersions.protocolId, protocolId))
          .orderBy(desc(protocolVersions.versionNumber));
        const versions: (ProtocolVersionEntry & { id: string })[] = rows.map(
          (row) => ({
            id: row.id,
            versionNumber: row.versionNumber,
            createdAt: row.createdAt,
            createdByName:
              names.get(row.createdByMembershipId) ?? "Membre retiré",
            changeNote: row.changeNote,
            validatedByName: row.validatedByMembershipId
              ? (names.get(row.validatedByMembershipId) ?? "Membre retiré")
              : null,
            validatedAt: row.validatedAt,
            followupCount: counts.get(row.id) ?? 0,
          }),
        );
        const selected =
          versionNumber === undefined
            ? versions.find((v) => v.id === protocol.currentVersionId)
            : versions.find((v) => v.versionNumber === versionNumber);
        if (!selected) throw new DomainError("not_found");
        const content = await readContent(tx, selected.id);
        if (!content) throw new DomainError("not_found");
        const isCurrent = selected.id === protocol.currentVersionId;
        const editable = canEditProtocol(actor, protocol);
        return {
          id: protocol.id,
          ownerMembershipId: protocol.ownerMembershipId,
          ownerName: protocol.ownerMembershipId
            ? (names.get(protocol.ownerMembershipId) ?? null)
            : null,
          fromLibrary: protocol.libraryKey !== null,
          archived: protocol.archivedAt !== null,
          isCurrent,
          version: { ...selected, content },
          versions,
          can: {
            edit: editable && protocol.archivedAt === null,
            archive: editable,
            validate:
              isCurrent &&
              selected.validatedAt === null &&
              protocol.archivedAt === null &&
              canValidateProtocol(actor, protocol),
            duplicateToCabinet: canCreateProtocol(actor, "cabinet"),
            duplicateToPersonal: canCreateProtocol(actor, "personal"),
          },
        };
      });
    },

    /** Nouveau protocole : sa première version est validée par le vétérinaire qui l'écrit. */
    async create(actor: Actor, scope: ProtocolScope, content: unknown) {
      if (!canCreateProtocol(actor, scope)) throw new DomainError("not_found");
      const parsed = parseContent(content);
      return run(actor, async (tx) => {
        const id = await createProtocol(tx, actor, {
          scope,
          content: parsed,
          validated: canValidateProtocol(actor, {
            ownerMembershipId: scope === "personal" ? actor.membershipId : null,
          }),
          changeNote: "Création",
        });
        await audit(tx, actor, "protocol.created", id, { scope });
        return id;
      });
    },

    /**
     * Modifier = écrire une nouvelle version. Les versions précédentes, et donc les suivis
     * déjà lancés avec elles, restent exactement comme ils étaient.
     */
    async update(
      actor: Actor,
      protocolId: string,
      content: unknown,
      changeNote: string,
    ) {
      const parsed = parseContent(content);
      const note = changeNoteSchema.safeParse(changeNote);
      if (!note.success) throw new DomainError("invalid_target");
      return run(actor, async (tx) => {
        const protocol = await loadEditable(tx, actor, protocolId);
        if (protocol.archivedAt) throw new DomainError("invalid_target");
        const versionNumber = await nextVersionNumber(tx, protocolId);
        await writeVersion(tx, actor, {
          protocolId,
          versionNumber,
          content: parsed,
          changeNote: note.data,
          validated: canValidateProtocol(actor, protocol),
        });
        await audit(tx, actor, "protocol.version_created", protocolId, {
          versionNumber,
        });
        return versionNumber;
      });
    },

    /** Copie de la version courante, à relire : la copie est à valider. */
    async duplicate(actor: Actor, protocolId: string, scope: ProtocolScope) {
      if (!canCreateProtocol(actor, scope)) throw new DomainError("not_found");
      return run(actor, async (tx) => {
        const source = await loadReadable(tx, actor, protocolId);
        if (!source.currentVersionId) throw new DomainError("not_found");
        const content = await readContent(tx, source.currentVersionId);
        if (!content) throw new DomainError("not_found");
        const name = `${content.name} (copie)`.slice(0, 120);
        const id = await createProtocol(tx, actor, {
          scope,
          content: { ...content, name },
          duplicatedFromVersionId: source.currentVersionId,
          validated: false,
          changeNote: "Copie",
        });
        await audit(tx, actor, "protocol.duplicated", id, {
          scope,
          fromProtocolId: protocolId,
        });
        return id;
      });
    },

    /** Le vétérinaire valide la version courante, dont ses signes d'alerte. */
    async validate(actor: Actor, protocolId: string) {
      await run(actor, async (tx) => {
        const protocol = await loadEditable(tx, actor, protocolId);
        if (!canValidateProtocol(actor, protocol))
          throw new DomainError("forbidden");
        if (!protocol.currentVersionId || protocol.archivedAt)
          throw new DomainError("invalid_target");
        const [current] = await tx
          .select({ validatedAt: protocolVersions.validatedAt })
          .from(protocolVersions)
          .where(eq(protocolVersions.id, protocol.currentVersionId));
        if (current?.validatedAt) return;
        const validated = await tx
          .update(protocolVersions)
          .set({
            validatedByMembershipId: actor.membershipId,
            validatedAt: new Date(),
          })
          .where(
            and(
              eq(protocolVersions.id, protocol.currentVersionId),
              eq(protocolVersions.protocolId, protocolId),
            ),
          )
          .returning({ n: protocolVersions.versionNumber });
        await audit(tx, actor, "protocol.validated", protocolId, {
          versionNumber: validated[0]?.n ?? null,
        });
      });
    },

    async setArchived(actor: Actor, protocolId: string, archived: boolean) {
      await run(actor, async (tx) => {
        const protocol = await loadEditable(tx, actor, protocolId);
        if ((protocol.archivedAt !== null) === archived) return;
        await tx
          .update(protocols)
          .set({ archivedAt: archived ? new Date() : null })
          .where(eq(protocols.id, protocolId));
        await audit(
          tx,
          actor,
          archived ? "protocol.archived" : "protocol.restored",
          protocolId,
        );
      });
    },

    /** Ajoute un modèle de la bibliothèque au cabinet ; il reste à valider par un vétérinaire. */
    async installFromLibrary(actor: Actor, key: string) {
      if (!canCreateProtocol(actor, "cabinet"))
        throw new DomainError("not_found");
      const entry = libraryProtocol(key);
      if (!entry) throw new DomainError("invalid_target");
      const { key: libraryKey, ...content } = entry;
      return run(actor, async (tx) => {
        const [existing] = await tx
          .select({ id: protocols.id })
          .from(protocols)
          .where(eq(protocols.libraryKey, libraryKey));
        if (existing) throw new DomainError("already_installed");
        const id = await createProtocol(tx, actor, {
          scope: "cabinet",
          content,
          libraryKey,
          validated: false,
          changeNote: "Ajouté depuis la bibliothèque de départ",
        });
        await audit(tx, actor, "protocol.installed", id, { libraryKey });
        return id;
      });
    },
  };
}

export type ProtocolsService = ReturnType<typeof protocolsService>;
