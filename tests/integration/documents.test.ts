import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createOrganization } from "../../db/seed/cabinets-fictifs";
import { fictionalPng } from "../support/png";
import { createMemoryStorage } from "@/adapters/object-storage/memory";
import { DomainError } from "@/domains/commun/actor";
import type { Actor } from "@/domains/commun/actor";
import {
  MAX_DOCUMENT_BYTES,
  documentsService,
} from "@/domains/documents/service";
import { isPermissionKey } from "@/domains/equipe/permissions";
import { signReadLink } from "@/domains/fichiers/liens";

import { asApp, errorCode, pools } from "./support/db";

/**
 * Documents du cabinet (ADR 0045) : lus par ceux qui voient les protocoles, gérés par qui
 * les gère ; type lu dans le fichier ; liens signés propres aux documents ; isolation entre
 * cabinets ; suppression définitive du fichier, ligne gardée ; journal sans contenu.
 */

const { app, admin, appDb } = pools();
afterAll(async () => {
  await app.end();
  await admin.end();
});

const SECRET = "clé-des-documents-du-test-".repeat(3);
const storage = createMemoryStorage();
const documents = documentsService({ db: appDb, storage, linkSecret: SECRET });

const org = randomUUID();
const other = randomUUID();
const tag = org.slice(0, 8);
let ids: { admin: string; vet: string; assistant: string; outsider: string };

const PDF = new TextEncoder().encode(
  "%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n",
);

async function actor(membershipId: string, organizationId = org) {
  const { rows } = await admin.query(
    `SELECT m.user_id, m.role, array_remove(array_agg(p.permission), NULL) AS permissions
     FROM memberships m LEFT JOIN membership_permissions p ON p.membership_id = m.id
     WHERE m.id = $1 GROUP BY m.id`,
    [membershipId],
  );
  const row = rows[0] as
    { user_id: string; role: Actor["role"]; permissions: string[] } | undefined;
  if (!row) throw new Error("membre inconnu");
  return {
    organizationId,
    userId: row.user_id,
    membershipId,
    role: row.role,
    permissions: new Set(row.permissions.filter(isPermissionKey)),
  } satisfies Actor;
}

async function refusal(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
}

function linkParts(url: string) {
  const parsed = new URL(url, "http://localhost");
  return {
    expires: parsed.searchParams.get("e") ?? "",
    signature: parsed.searchParams.get("s") ?? "",
  };
}

beforeAll(async () => {
  const [adminId, vet, assistant] = await createOrganization(
    appDb,
    org,
    "Clinique d'essai des documents",
    [
      {
        email: `da-${tag}@essai.test`,
        displayName: "Dr Lou Admin",
        role: "admin_vet",
      },
      { email: `dv-${tag}@essai.test`, displayName: "Dr Léo Vet", role: "vet" },
      {
        email: `ds-${tag}@essai.test`,
        displayName: "Sam Assistant",
        role: "assistant",
      },
    ],
  );
  const [outsider] = await createOrganization(
    appDb,
    other,
    "Autre clinique d'essai",
    [
      {
        email: `do-${tag}@essai.test`,
        displayName: "Dr Max Autre",
        role: "admin_vet",
      },
    ],
  );
  if (!adminId || !vet || !assistant || !outsider) throw new Error("cabinet");
  ids = { admin: adminId, vet, assistant, outsider };
});

let pdfId: string;
let photoId: string;

describe("documents du cabinet", () => {
  it("l'administrateur ajoute un PDF et une image ; l'image perd ses métadonnées", async () => {
    const lou = await actor(ids.admin);
    pdfId = await documents.add(lou, {
      title: "  Consignes après stérilisation  ",
      category: "owner_sheet",
      bytes: PDF,
    });
    // PNG avec un bloc de texte (métadonnée) ajouté avant la fin.
    const png = fictionalPng();
    const text = Buffer.from("tEXtAuthor\0Cabinet", "latin1");
    const length = Buffer.alloc(4);
    length.writeUInt32BE(text.length - 4);
    const withMeta = Buffer.concat([
      png.subarray(0, png.length - 12),
      length,
      text,
      Buffer.alloc(4),
      png.subarray(png.length - 12),
    ]);
    photoId = await documents.add(lou, {
      title: "Plan du cabinet",
      category: "procedure",
      bytes: new Uint8Array(withMeta),
    });

    const list = await documents.list(lou);
    expect(list.map((d) => d.title)).toEqual([
      "Plan du cabinet",
      "Consignes après stérilisation",
    ]);
    expect(list[1]).toMatchObject({
      contentType: "application/pdf",
      category: "owner_sheet",
      addedBy: "Dr Lou Admin",
    });
    const photo = await documents.open(
      lou,
      photoId,
      linkParts(list[0]?.link?.url ?? ""),
    );
    expect(photo.contentType).toBe("image/png");
    expect(Buffer.from(photo.bytes).includes("tEXt")).toBe(false);
  });

  it("refuse un type déguisé, un fichier vide ou trop lourd, une catégorie inconnue", async () => {
    const lou = await actor(ids.admin);
    const base = { title: "Essai", category: "other" };
    const html = new TextEncoder().encode("<html><script>alert(1)</script>");
    expect(await refusal(documents.add(lou, { ...base, bytes: html }))).toBe(
      "invalid_file",
    );
    expect(
      await refusal(documents.add(lou, { ...base, bytes: new Uint8Array() })),
    ).toBe("invalid_file");
    const heavy = new Uint8Array(MAX_DOCUMENT_BYTES + 1);
    heavy.set(PDF);
    expect(await refusal(documents.add(lou, { ...base, bytes: heavy }))).toBe(
      "invalid_file",
    );
    expect(
      await refusal(
        documents.add(lou, { ...base, category: "dossier", bytes: PDF }),
      ),
    ).toBe("invalid_target");
    expect(
      await refusal(
        documents.add(lou, { ...base, title: "x".repeat(121), bytes: PDF }),
      ),
    ).toBe("invalid_target");
  });

  it("un vétérinaire lit sans gérer ; un assistant sans accès aux protocoles ne voit rien", async () => {
    const leo = await actor(ids.vet);
    const sam = await actor(ids.assistant);
    expect((await documents.list(leo)).length).toBe(2);
    expect(
      await refusal(
        documents.add(leo, { title: "Essai", category: "other", bytes: PDF }),
      ),
    ).toBe("not_found");
    expect(await refusal(documents.remove(leo, pdfId))).toBe("not_found");
    expect(await refusal(documents.list(sam))).toBe("not_found");
    // Même avec un lien signé pour lui, l'assistant n'ouvre rien.
    const forged = signReadLink({
      secret: SECRET,
      fileId: pdfId,
      membershipId: ids.assistant,
      scope: "document",
    });
    expect(
      await refusal(documents.open(sam, pdfId, linkParts(forged.url))),
    ).toBe("not_found");
  });

  it("un lien d'une autre personne, périmé ou d'une photo de suivi ne s'ouvre pas", async () => {
    const lou = await actor(ids.admin);
    const leo = await actor(ids.vet);
    const [, pdf] = await documents.list(lou);
    expect(
      await refusal(
        documents.open(leo, pdfId, linkParts(pdf?.link?.url ?? "")),
      ),
    ).toBe("not_found");
    const old = signReadLink({
      secret: SECRET,
      fileId: pdfId,
      membershipId: ids.admin,
      scope: "document",
      now: new Date(Date.now() - 10 * 60_000),
    });
    expect(await refusal(documents.open(lou, pdfId, linkParts(old.url)))).toBe(
      "not_found",
    );
    const attachmentLink = signReadLink({
      secret: SECRET,
      fileId: pdfId,
      membershipId: ids.admin,
    });
    expect(
      await refusal(documents.open(lou, pdfId, linkParts(attachmentLink.url))),
    ).toBe("not_found");
  });

  it("un autre cabinet ne voit ni n'ouvre aucun document", async () => {
    const max = await actor(ids.outsider, other);
    expect(await documents.list(max)).toEqual([]);
    const link = signReadLink({
      secret: SECRET,
      fileId: pdfId,
      membershipId: ids.outsider,
      scope: "document",
    });
    expect(await refusal(documents.open(max, pdfId, linkParts(link.url)))).toBe(
      "not_found",
    );
    expect(await refusal(documents.remove(max, pdfId))).toBe("not_found");
    const code = await asApp(app, other, (client) =>
      errorCode(
        client.query(
          `INSERT INTO cabinet_documents (organization_id, title, category, storage_key, content_type, byte_size, sha256)
           VALUES ($1, 'Intrus', 'other', 'o/intrus/documents/x.pdf', 'application/pdf', 10, repeat('a', 64))`,
          [org],
        ),
      ),
    );
    expect(code).toBe("42501");
  });

  it("supprimer efface le fichier, garde la ligne, et ne se refait pas", async () => {
    const lou = await actor(ids.admin);
    const before = storage.keys().length;
    await documents.remove(lou, photoId);
    expect(storage.keys().length).toBe(before - 1);
    expect((await documents.list(lou)).map((d) => d.id)).toEqual([pdfId]);
    expect(await refusal(documents.remove(lou, photoId))).toBe("not_found");
    const { rows } = await admin.query(
      "SELECT deleted_at IS NOT NULL AS deleted FROM cabinet_documents WHERE id = $1",
      [photoId],
    );
    expect(rows[0]).toEqual({ deleted: true });
    // La base refuse de faire revenir un document supprimé, et toute suppression directe.
    const restore = await asApp(app, org, (client) =>
      errorCode(
        client.query(
          "UPDATE cabinet_documents SET deleted_at = NULL WHERE id = $1",
          [photoId],
        ),
      ),
    );
    expect(restore).toBe("23514");
    const erase = await asApp(app, org, (client) =>
      errorCode(client.query("DELETE FROM cabinet_documents")),
    );
    expect(erase).toBe("42501");
    const rename = await asApp(app, org, (client) =>
      errorCode(client.query("UPDATE cabinet_documents SET title = 'x'")),
    );
    expect(rename).toBe("42501");
  });

  it("le journal garde l'ajout, l'ouverture et la suppression, sans titre ni contenu", async () => {
    const { rows } = await admin.query(
      `SELECT action, actor_membership_id, metadata FROM audit_events
       WHERE organization_id = $1 AND target_type = 'document' ORDER BY occurred_at, action`,
      [org],
    );
    const actions = rows.map((row: { action: string }) => row.action);
    expect(actions.filter((a) => a === "document.added")).toHaveLength(2);
    expect(actions).toContain("document.opened");
    expect(actions).toContain("document.removed");
    const serialized = JSON.stringify(rows);
    expect(serialized).not.toContain("Consignes");
    expect(serialized).not.toContain("Plan du cabinet");
  });
});
