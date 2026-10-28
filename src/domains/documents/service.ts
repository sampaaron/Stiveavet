import { randomUUID } from "node:crypto";

import { and, count, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import type { ObjectStorage, StoredObject } from "@/adapters/object-storage";
import { recordAudit } from "@/domains/audit/journal";
import { DomainError, assertPermission } from "@/domains/commun/actor";
import type { Actor } from "@/domains/commun/actor";
import type { PermissionKey } from "@/domains/equipe/permissions";
import { signReadLink, verifyReadLink } from "@/domains/fichiers/liens";
import type { SignedLink } from "@/domains/fichiers/liens";
import {
  sha256Hex,
  sniffImage,
  sniffPdf,
  stripImageMetadata,
} from "@/domains/fichiers/media";
import { canBrowseProtocols } from "@/domains/protocoles/policies";
import { memberships, users } from "@/server/db/schema";
import { tenantRunner } from "@/server/db/tenant";
import type { Database, TenantTransaction } from "@/server/db/tenant";

import { DOCUMENT_CATEGORIES, cabinetDocuments } from "./schema";
import type { DocumentCategory, DocumentContentType } from "./schema";

/**
 * Documents du cabinet (ADR 0045) : fiches de consignes, procédures internes, documents
 * administratifs. Ce n'est pas un dossier patient.
 * - Lus par ceux qui voient les protocoles ; ajoutés et supprimés par qui gère les protocoles.
 * - Type lu dans le fichier (PDF ou image), 5 Mo au plus ; une image perd ses métadonnées.
 * - Fichier dans le stockage objet privé ; ouverture par lien signé de cinq minutes, lié au
 *   membre, droits revérifiés et ouverture journalisée à chaque fois.
 */

export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
/** Plafond par cabinet : la bibliothèque n'est pas un espace de stockage. */
export const MAX_DOCUMENTS = 200;

export const DOCUMENT_MANAGER: PermissionKey = "protocols.manage";

export const documentInput = z.object({
  title: z.string().trim().min(1).max(120),
  category: z.enum(DOCUMENT_CATEGORIES),
});

export type DocumentView = {
  id: string;
  title: string;
  category: DocumentCategory;
  contentType: DocumentContentType;
  byteSize: number;
  createdAt: Date;
  addedBy: string | null;
  /** Absent seulement pour un fichier manquant du stockage simulé. */
  link: SignedLink | null;
};

const EXTENSIONS: Record<DocumentContentType, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Lus par ceux qui voient les protocoles, avec qui ils vont de pair. */
function assertReader(actor: Actor) {
  if (!canBrowseProtocols(actor)) throw new DomainError("not_found");
}

/** Type lu dans le contenu ; une image est recopiée sans ses métadonnées. */
function checkFile(bytes: Uint8Array): {
  bytes: Uint8Array;
  contentType: DocumentContentType;
} {
  if (bytes.length === 0 || bytes.length > MAX_DOCUMENT_BYTES)
    throw new DomainError("invalid_file");
  if (sniffPdf(bytes)) return { bytes, contentType: "application/pdf" };
  const image = sniffImage(bytes);
  const clean = image && stripImageMetadata(bytes, image);
  if (!image || !clean) throw new DomainError("invalid_file");
  return { bytes: clean, contentType: image };
}

const live = (tx: TenantTransaction, id: string) =>
  tx
    .select({
      storageKey: cabinetDocuments.storageKey,
      contentType: cabinetDocuments.contentType,
      title: cabinetDocuments.title,
    })
    .from(cabinetDocuments)
    .where(
      and(eq(cabinetDocuments.id, id), isNull(cabinetDocuments.deletedAt)),
    );

export type DocumentsService = ReturnType<typeof documentsService>;

export function documentsService(deps: {
  db: Database;
  storage: ObjectStorage;
  /** Clé des liens de lecture signés (ADR 0019). */
  linkSecret: string;
}) {
  const { db, storage, linkSecret } = deps;
  const run = tenantRunner(db);

  return {
    /** Documents en cours, du plus récent au plus ancien, avec leur lien d'ouverture. */
    async list(actor: Actor): Promise<DocumentView[]> {
      assertReader(actor);
      const rows = await run(actor, (tx) =>
        tx
          .select({
            id: cabinetDocuments.id,
            title: cabinetDocuments.title,
            category: cabinetDocuments.category,
            contentType: cabinetDocuments.contentType,
            byteSize: cabinetDocuments.byteSize,
            createdAt: cabinetDocuments.createdAt,
            storageKey: cabinetDocuments.storageKey,
            addedBy: users.displayName,
          })
          .from(cabinetDocuments)
          .leftJoin(
            memberships,
            eq(memberships.id, cabinetDocuments.addedByMembershipId),
          )
          .leftJoin(users, eq(users.id, memberships.userId))
          .where(isNull(cabinetDocuments.deletedAt))
          .orderBy(desc(cabinetDocuments.createdAt)),
      );
      const now = new Date();
      return Promise.all(
        rows.map(async ({ storageKey, ...row }) => ({
          ...row,
          link:
            storage.simulated && !(await storage.hasObject(storageKey))
              ? null
              : signReadLink({
                  secret: linkSecret,
                  fileId: row.id,
                  membershipId: actor.membershipId,
                  scope: "document",
                  now,
                }),
        })),
      );
    },

    /** Dépose le fichier puis l'enregistre ; si l'enregistrement échoue, le fichier part. */
    async add(
      actor: Actor,
      input: { title: unknown; category: unknown; bytes: Uint8Array },
    ): Promise<string> {
      assertPermission(actor, DOCUMENT_MANAGER);
      const fields = documentInput.safeParse(input);
      if (!fields.success) throw new DomainError("invalid_target");
      const file = checkFile(input.bytes);
      const id = randomUUID();
      const key = `o/${actor.organizationId}/documents/${id}.${EXTENSIONS[file.contentType]}`;
      await storage.putObject(key, file);
      try {
        await run(actor, async (tx) => {
          const [current] = await tx
            .select({ n: count() })
            .from(cabinetDocuments)
            .where(isNull(cabinetDocuments.deletedAt));
          if ((current?.n ?? 0) >= MAX_DOCUMENTS)
            throw new DomainError("document_limit");
          await tx.insert(cabinetDocuments).values({
            id,
            organizationId: actor.organizationId,
            title: fields.data.title,
            category: fields.data.category,
            storageKey: key,
            contentType: file.contentType,
            byteSize: file.bytes.length,
            sha256: sha256Hex(file.bytes),
            addedByMembershipId: actor.membershipId,
          });
          await recordAudit(
            tx,
            actor,
            "document.added",
            { type: "document", id },
            { contentType: file.contentType, byteSize: file.bytes.length },
          );
        });
      } catch (error) {
        await storage.deleteObject(key);
        throw error;
      }
      return id;
    },

    /**
     * Supprime le fichier du stockage et marque la ligne, dans la même transaction : si le
     * stockage refuse, rien n'est marqué et la suppression peut être relancée.
     */
    async remove(actor: Actor, documentId: string): Promise<void> {
      assertPermission(actor, DOCUMENT_MANAGER);
      if (!z.uuid().safeParse(documentId).success)
        throw new DomainError("not_found");
      await run(actor, async (tx) => {
        const [row] = await live(tx, documentId).for("update");
        if (!row) throw new DomainError("not_found");
        await tx
          .update(cabinetDocuments)
          .set({ deletedAt: new Date() })
          .where(eq(cabinetDocuments.id, documentId));
        await recordAudit(tx, actor, "document.removed", {
          type: "document",
          id: documentId,
        });
        await storage.deleteObject(row.storageKey);
      });
    },

    /**
     * Ouverture d'un lien : signature et expiration pour ce membre, puis droits revérifiés.
     * Tout refus est un `not_found`, sans dire pourquoi.
     */
    async open(
      actor: Actor,
      documentId: string,
      link: { expires: string; signature: string },
    ): Promise<StoredObject & { title: string }> {
      if (!z.uuid().safeParse(documentId).success)
        throw new DomainError("not_found");
      const valid = verifyReadLink({
        secret: linkSecret,
        fileId: documentId,
        membershipId: actor.membershipId,
        expires: link.expires,
        signature: link.signature,
        scope: "document",
      });
      if (!valid) throw new DomainError("not_found");
      assertReader(actor);
      const row = await run(actor, async (tx) => {
        const [found] = await live(tx, documentId);
        if (!found) throw new DomainError("not_found");
        await recordAudit(tx, actor, "document.opened", {
          type: "document",
          id: documentId,
        });
        return found;
      });
      const object = await storage.getObject(row.storageKey);
      if (!object) throw new DomainError("not_found");
      return {
        bytes: object.bytes,
        contentType: row.contentType,
        title: row.title,
      };
    },
  };
}
