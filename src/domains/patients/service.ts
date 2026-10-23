import {
  and,
  asc,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  isNotNull,
  isNull,
  ne,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { z } from "zod";

import { recordAudit } from "@/domains/audit/journal";
import { DomainError, assertPermission } from "@/domains/commun/actor";
import type { Actor } from "@/domains/commun/actor";
import type { FollowupAccess } from "@/domains/suivis/policies";
import { followupAccessMap } from "@/domains/suivis/service";
import {
  animalOwners,
  animals,
  appointments,
  followupContacts,
  followups,
  ownerContacts,
  owners,
} from "@/server/db/schema";
import { tenantRunner } from "@/server/db/tenant";
import type { Database, TenantTransaction } from "@/server/db/tenant";

import { patientInput, registryFilters } from "./content";
import type { OwnerInput, PatientInput, RegistryFilters } from "./content";

/**
 * Registre des animaux et de leurs propriétaires, saisi par le cabinet (MVP, ADR 0030).
 * Lecture et écriture demandent le droit de préparer un suivi : ce sont les personnes qui
 * enregistrent les patients. Les notes internes demandent en plus la lecture clinique, et
 * l'historique ne montre chaque suivi qu'au niveau de détail autorisé (dossier privé compris).
 * Le journal ne garde que des identifiants et des compteurs.
 */

type FollowupStatus = (typeof followups.$inferSelect)["status"];

export type RegistryRow = {
  id: string;
  name: string;
  species: "dog" | "cat";
  breed: string | null;
  birthDate: string | null;
  archived: boolean;
  owners: string[];
  /** Suivi non terminé, s'il y en a un ; `visible` : l'acteur peut l'ouvrir. */
  openFollowup: { id: string; status: FollowupStatus; visible: boolean } | null;
};

export type OwnerView = {
  id: string;
  fullName: string;
  language: "fr" | "en";
  phone: string | null;
  email: string | null;
};

export type HistoryEntry = {
  id: string;
  status: FollowupStatus;
  access: Exclude<FollowupAccess, "none"> | "restricted";
  isTest: boolean;
  createdAt: Date;
  startedAt: Date | null;
  endedAt: Date | null;
  /** Détails cliniques, seulement avec la lecture clinique du dossier. */
  procedure: string | null;
  procedureAt: Date | null;
};

export type AnimalRecord = {
  id: string;
  name: string;
  species: "dog" | "cat";
  breed: string | null;
  sex: "female" | "male" | null;
  neutered: boolean | null;
  birthDate: string | null;
  weightGrams: number | null;
  /** null si l'acteur n'a pas la lecture clinique. */
  notes: string | null;
  notesHidden: boolean;
  externalRef: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  owners: OwnerView[];
  history: HistoryEntry[];
  openFollowupId: string | null;
  canDelete: boolean;
};

const REGISTRY_LIMIT = 200;
const idSchema = z.uuid();

function assertRegistry(actor: Actor) {
  assertPermission(actor, "followups.launch");
}

/** Motif ILIKE littéral : `%`, `_` et `\` saisis sont cherchés tels quels. */
function likePattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

function auditAnimal(
  tx: TenantTransaction,
  actor: Actor,
  action: string,
  animalId: string,
  metadata: Record<string, string | number | boolean | null> = {},
) {
  return recordAudit(
    tx,
    actor,
    action,
    { type: "animal", id: animalId },
    metadata,
  );
}

async function openFollowupOf(tx: TenantTransaction, animalId: string) {
  const [open] = await tx
    .select({ id: followups.id })
    .from(followups)
    .where(and(eq(followups.animalId, animalId), ne(followups.status, "ended")))
    .limit(1);
  return open?.id ?? null;
}

/** Numéro WhatsApp actuel de chaque propriétaire : le plus récent enregistré. */
export async function currentContacts(
  tx: TenantTransaction,
  ownerIds: readonly string[],
) {
  const result = new Map<
    string,
    { whatsapp?: { id: string; value: string }; email?: string }
  >();
  if (!ownerIds.length) return result;
  const rows = await tx
    .select({
      id: ownerContacts.id,
      ownerId: ownerContacts.ownerId,
      kind: ownerContacts.kind,
      value: ownerContacts.value,
    })
    .from(ownerContacts)
    .where(inArray(ownerContacts.ownerId, [...ownerIds]))
    .orderBy(desc(ownerContacts.createdAt), desc(ownerContacts.id));
  for (const row of rows) {
    const entry = result.get(row.ownerId) ?? {};
    if (row.kind === "whatsapp" && !entry.whatsapp)
      entry.whatsapp = { id: row.id, value: row.value };
    if (row.kind === "email" && !entry.email) entry.email = row.value;
    result.set(row.ownerId, entry);
  }
  return result;
}

/**
 * Propriétaire du cabinet qui a déjà ce numéro WhatsApp, sinon un nouveau. Le nom saisi ne
 * remplace pas celui d'un propriétaire existant : il sert peut-être à d'autres animaux.
 */
async function findOrCreateOwner(
  tx: TenantTransaction,
  organizationId: string,
  owner: OwnerInput,
): Promise<{ ownerId: string; reused: boolean }> {
  const [known] = await tx
    .select({ ownerId: ownerContacts.ownerId })
    .from(ownerContacts)
    .where(
      and(
        eq(ownerContacts.kind, "whatsapp"),
        eq(ownerContacts.value, owner.phone),
      ),
    )
    .orderBy(asc(ownerContacts.createdAt))
    .limit(1);
  if (known) return { ownerId: known.ownerId, reused: true };
  const [created] = await tx
    .insert(owners)
    .values({
      organizationId,
      fullName: owner.fullName,
      preferredLanguage: owner.language,
    })
    .returning({ id: owners.id });
  if (!created) throw new Error("Propriétaire non créé");
  await setContacts(tx, organizationId, created.id, owner);
  return { ownerId: created.id, reused: false };
}

/**
 * Coordonnées d'un propriétaire. Un nouveau numéro s'ajoute (les suivis lancés gardent celui
 * de leur lancement) ; l'ancien disparaît s'il ne sert à aucun suivi. L'e-mail est remplacé.
 */
async function setContacts(
  tx: TenantTransaction,
  organizationId: string,
  ownerId: string,
  owner: Pick<OwnerInput, "phone" | "email">,
) {
  await tx
    .insert(ownerContacts)
    .values({ organizationId, ownerId, kind: "whatsapp", value: owner.phone })
    .onConflictDoNothing();
  const [current] = await tx
    .select({ id: ownerContacts.id })
    .from(ownerContacts)
    .where(
      and(
        eq(ownerContacts.ownerId, ownerId),
        eq(ownerContacts.kind, "whatsapp"),
        eq(ownerContacts.value, owner.phone),
      ),
    );
  if (!current) throw new Error("Contact non créé");
  // Le numéro saisi devient le numéro actuel (le plus récent), même s'il existait déjà.
  await tx
    .update(ownerContacts)
    .set({ createdAt: new Date() })
    .where(eq(ownerContacts.id, current.id));
  await tx
    .delete(ownerContacts)
    .where(
      and(
        eq(ownerContacts.ownerId, ownerId),
        eq(ownerContacts.kind, "whatsapp"),
        ne(ownerContacts.id, current.id),
        notInArray(
          ownerContacts.id,
          tx
            .select({ id: followupContacts.ownerContactId })
            .from(followupContacts)
            .where(eq(followupContacts.ownerId, ownerId)),
        ),
      ),
    );
  await tx
    .delete(ownerContacts)
    .where(
      and(eq(ownerContacts.ownerId, ownerId), eq(ownerContacts.kind, "email")),
    );
  if (owner.email)
    await tx.insert(ownerContacts).values({
      organizationId,
      ownerId,
      kind: "email",
      value: owner.email,
    });
}

/** Retire un propriétaire de l'animal ; il disparaît s'il ne sert plus à rien. */
async function unlinkOwner(
  tx: TenantTransaction,
  animalId: string,
  ownerId: string,
) {
  await tx
    .delete(animalOwners)
    .where(
      and(
        eq(animalOwners.animalId, animalId),
        eq(animalOwners.ownerId, ownerId),
      ),
    );
  await tx
    .delete(owners)
    .where(
      and(
        eq(owners.id, ownerId),
        sql`NOT EXISTS (SELECT 1 FROM animal_owners ao WHERE ao.owner_id = ${owners.id})`,
        sql`NOT EXISTS (SELECT 1 FROM followup_contacts fc WHERE fc.owner_id = ${owners.id})`,
      ),
    );
}

function parsePatient(input: unknown): PatientInput {
  const parsed = patientInput().safeParse(input);
  if (!parsed.success) throw new DomainError("invalid_target");
  const phones = parsed.data.owners.map((owner) => owner.phone);
  if (new Set(phones).size !== phones.length)
    throw new DomainError("invalid_target");
  return parsed.data;
}

function animalValues(input: PatientInput["animal"]) {
  return {
    name: input.name,
    species: input.species,
    breed: input.breed,
    sex: input.sex,
    neutered: input.neutered,
    birthDate: input.birthDate,
    weightGrams: input.weightKg,
    notes: input.notes,
  };
}

export function patientsService(db: Database) {
  const run = tenantRunner(db);

  async function loadAnimal(tx: TenantTransaction, animalId: string) {
    if (!idSchema.safeParse(animalId).success)
      throw new DomainError("not_found");
    const [animal] = await tx
      .select()
      .from(animals)
      .where(eq(animals.id, animalId));
    if (!animal) throw new DomainError("not_found");
    return animal;
  }

  async function linkedOwnerIds(tx: TenantTransaction, animalId: string) {
    const rows = await tx
      .select({ ownerId: animalOwners.ownerId })
      .from(animalOwners)
      .where(eq(animalOwners.animalId, animalId))
      .orderBy(asc(animalOwners.createdAt));
    return rows.map((row) => row.ownerId);
  }

  return {
    /** Animaux du cabinet, filtrés ; les 200 premiers par ordre alphabétique. */
    async list(actor: Actor, raw: Partial<RegistryFilters> = {}) {
      assertRegistry(actor);
      const filters = registryFilters.parse(raw);
      return run(actor, async (tx): Promise<RegistryRow[]> => {
        const conditions: (SQL | undefined)[] = [];
        if (filters.species !== "all")
          conditions.push(eq(animals.species, filters.species));
        if (filters.status === "active")
          conditions.push(isNull(animals.archivedAt));
        if (filters.status === "archived")
          conditions.push(isNotNull(animals.archivedAt));
        if (filters.status === "followed")
          conditions.push(
            exists(
              tx
                .select({ one: sql`1` })
                .from(followups)
                .where(
                  and(
                    eq(followups.animalId, animals.id),
                    ne(followups.status, "ended"),
                  ),
                ),
            ),
          );
        if (filters.query.length >= 2) {
          const pattern = likePattern(filters.query);
          const digits = filters.query.replace(/\D/g, "");
          conditions.push(
            or(
              ilike(animals.name, pattern),
              ilike(animals.breed, pattern),
              exists(
                tx
                  .select({ one: sql`1` })
                  .from(animalOwners)
                  .innerJoin(owners, eq(owners.id, animalOwners.ownerId))
                  .where(
                    and(
                      eq(animalOwners.animalId, animals.id),
                      ilike(owners.fullName, pattern),
                    ),
                  ),
              ),
              digits.length >= 4
                ? exists(
                    tx
                      .select({ one: sql`1` })
                      .from(animalOwners)
                      .innerJoin(
                        ownerContacts,
                        eq(ownerContacts.ownerId, animalOwners.ownerId),
                      )
                      .where(
                        and(
                          eq(animalOwners.animalId, animals.id),
                          eq(ownerContacts.kind, "whatsapp"),
                          ilike(ownerContacts.value, likePattern(digits)),
                        ),
                      ),
                  )
                : undefined,
            ),
          );
        }
        const rows = await tx
          .select({
            id: animals.id,
            name: animals.name,
            species: animals.species,
            breed: animals.breed,
            birthDate: animals.birthDate,
            archivedAt: animals.archivedAt,
          })
          .from(animals)
          .where(and(...conditions))
          .orderBy(asc(sql`lower(${animals.name})`), asc(animals.id))
          .limit(REGISTRY_LIMIT);
        const ids = rows.map((row) => row.id);
        if (!ids.length) return [];

        const ownerRows = await tx
          .select({ animalId: animalOwners.animalId, name: owners.fullName })
          .from(animalOwners)
          .innerJoin(owners, eq(owners.id, animalOwners.ownerId))
          .where(inArray(animalOwners.animalId, ids))
          .orderBy(asc(animalOwners.createdAt));
        const open = await tx
          .select({
            id: followups.id,
            animalId: followups.animalId,
            status: followups.status,
            responsibleMembershipId: followups.responsibleMembershipId,
            isPrivate: followups.isPrivate,
          })
          .from(followups)
          .where(
            and(
              inArray(followups.animalId, ids),
              ne(followups.status, "ended"),
            ),
          );
        const access = await followupAccessMap(tx, actor, open);
        const openByAnimal = new Map(open.map((row) => [row.animalId, row]));

        return rows.map((row) => {
          const followup = openByAnimal.get(row.id);
          return {
            id: row.id,
            name: row.name,
            species: row.species,
            breed: row.breed,
            birthDate: row.birthDate,
            archived: row.archivedAt !== null,
            owners: ownerRows
              .filter((owner) => owner.animalId === row.id)
              .map((owner) => owner.name),
            openFollowup: followup
              ? {
                  id: followup.id,
                  status: followup.status,
                  visible: (access.get(followup.id) ?? "none") !== "none",
                }
              : null,
          };
        });
      });
    },

    /** Fiche d'un animal ; chaque consultation est journalisée. */
    async get(actor: Actor, animalId: string): Promise<AnimalRecord> {
      assertRegistry(actor);
      return run(actor, async (tx) => {
        const animal = await loadAnimal(tx, animalId);
        const ownerIds = await linkedOwnerIds(tx, animalId);
        const ownerRows = ownerIds.length
          ? await tx
              .select({
                id: owners.id,
                fullName: owners.fullName,
                language: owners.preferredLanguage,
              })
              .from(owners)
              .where(inArray(owners.id, ownerIds))
          : [];
        const contacts = await currentContacts(tx, ownerIds);

        const followupRows = await tx
          .select({
            id: followups.id,
            status: followups.status,
            isTest: followups.isTest,
            isPrivate: followups.isPrivate,
            responsibleMembershipId: followups.responsibleMembershipId,
            procedure: followups.procedure,
            procedureAt: followups.procedureAt,
            createdAt: followups.createdAt,
            startedAt: followups.startedAt,
            endedAt: followups.endedAt,
          })
          .from(followups)
          .where(eq(followups.animalId, animalId))
          .orderBy(desc(followups.createdAt));
        const access = await followupAccessMap(tx, actor, followupRows);
        const [appointment] = await tx
          .select({ id: appointments.id })
          .from(appointments)
          .where(eq(appointments.animalId, animalId))
          .limit(1);

        const clinical = actor.permissions.has("clinical.read");
        await auditAnimal(tx, actor, "animal.viewed", animalId);
        return {
          id: animal.id,
          name: animal.name,
          species: animal.species,
          breed: animal.breed,
          sex: animal.sex,
          neutered: animal.neutered,
          birthDate: animal.birthDate,
          weightGrams: animal.weightGrams,
          notes: clinical ? animal.notes : null,
          notesHidden: !clinical && animal.notes !== null,
          externalRef: animal.externalRef,
          archivedAt: animal.archivedAt,
          createdAt: animal.createdAt,
          owners: ownerIds.flatMap((id) => {
            const owner = ownerRows.find((row) => row.id === id);
            if (!owner) return [];
            const contact = contacts.get(id);
            return [
              {
                id,
                fullName: owner.fullName,
                language: owner.language,
                phone: contact?.whatsapp?.value ?? null,
                email: contact?.email ?? null,
              },
            ];
          }),
          history: followupRows.map((row) => {
            const level = access.get(row.id) ?? "none";
            const detailed = level === "clinical";
            return {
              id: row.id,
              status: row.status,
              access: level === "none" ? "restricted" : level,
              isTest: row.isTest,
              createdAt: row.createdAt,
              startedAt: level === "none" ? null : row.startedAt,
              endedAt: level === "none" ? null : row.endedAt,
              procedure: detailed ? row.procedure : null,
              procedureAt: detailed ? row.procedureAt : null,
            };
          }),
          openFollowupId:
            followupRows.find((row) => row.status !== "ended")?.id ?? null,
          canDelete: followupRows.length === 0 && !appointment,
        };
      });
    },

    /** Nouvel animal et ses propriétaires (rattachés s'ils existent déjà, par leur numéro). */
    async create(actor: Actor, input: unknown): Promise<string> {
      assertRegistry(actor);
      const patient = parsePatient(input);
      return run(actor, async (tx) => {
        const organizationId = actor.organizationId;
        const [created] = await tx
          .insert(animals)
          .values({ organizationId, ...animalValues(patient.animal) })
          .returning({ id: animals.id });
        if (!created) throw new Error("Animal non créé");
        let reused = 0;
        for (const owner of patient.owners) {
          const result = await findOrCreateOwner(tx, organizationId, owner);
          if (result.reused) reused += 1;
          await tx
            .insert(animalOwners)
            .values({
              organizationId,
              animalId: created.id,
              ownerId: result.ownerId,
            })
            .onConflictDoNothing();
        }
        await auditAnimal(tx, actor, "animal.created", created.id, {
          owners: patient.owners.length,
          reusedOwners: reused,
        });
        return created.id;
      });
    },

    /**
     * Modifie l'animal et ses propriétaires. Un propriétaire garde son identifiant (`id`) ;
     * sans identifiant, il est ajouté ; absent de la saisie, il est retiré de l'animal.
     */
    async update(actor: Actor, animalId: string, input: unknown) {
      assertRegistry(actor);
      const ids = z
        .object({ owners: z.array(z.object({ id: z.uuid().nullable() })) })
        .safeParse(input);
      if (!ids.success) throw new DomainError("invalid_target");
      const patient = parsePatient(input);
      await run(actor, async (tx) => {
        const organizationId = actor.organizationId;
        const animal = await loadAnimal(tx, animalId);
        if (animal.archivedAt) throw new DomainError("invalid_transition");
        // Sans lecture clinique, les notes ne sont ni lues ni réécrites.
        const { notes, ...identity } = animalValues(patient.animal);
        await tx
          .update(animals)
          .set(
            actor.permissions.has("clinical.read")
              ? { ...identity, notes }
              : identity,
          )
          .where(eq(animals.id, animalId));

        const linked = await linkedOwnerIds(tx, animalId);
        const kept = new Set<string>();
        for (const [index, owner] of patient.owners.entries()) {
          const ownerId = ids.data.owners[index]?.id ?? null;
          if (ownerId) {
            if (!linked.includes(ownerId))
              throw new DomainError("invalid_target");
            await tx
              .update(owners)
              .set({
                fullName: owner.fullName,
                preferredLanguage: owner.language,
              })
              .where(eq(owners.id, ownerId));
            await setContacts(tx, organizationId, ownerId, owner);
            kept.add(ownerId);
          } else {
            const result = await findOrCreateOwner(tx, organizationId, owner);
            await tx
              .insert(animalOwners)
              .values({ organizationId, animalId, ownerId: result.ownerId })
              .onConflictDoNothing();
            kept.add(result.ownerId);
          }
        }
        let removed = 0;
        for (const ownerId of linked)
          if (!kept.has(ownerId)) {
            await unlinkOwner(tx, animalId, ownerId);
            removed += 1;
          }
        await auditAnimal(tx, actor, "animal.updated", animalId, {
          owners: patient.owners.length,
          removedOwners: removed,
        });
      });
    },

    /** Archive (masque du registre) ou restaure ; impossible pendant un suivi ouvert. */
    async setArchived(actor: Actor, animalId: string, archived: boolean) {
      assertRegistry(actor);
      await run(actor, async (tx) => {
        const animal = await loadAnimal(tx, animalId);
        if ((animal.archivedAt !== null) === archived) return;
        if (archived && (await openFollowupOf(tx, animalId)))
          throw new DomainError("invalid_transition");
        await tx
          .update(animals)
          .set({ archivedAt: archived ? new Date() : null })
          .where(eq(animals.id, animalId));
        await auditAnimal(
          tx,
          actor,
          archived ? "animal.archived" : "animal.restored",
          animalId,
        );
      });
    },

    /**
     * Efface un animal jamais suivi (saisi par erreur) et ses propriétaires orphelins. Un
     * animal qui a eu un suivi suit les règles de conservation de ses suivis.
     */
    async remove(actor: Actor, animalId: string) {
      assertRegistry(actor);
      await run(actor, async (tx) => {
        await loadAnimal(tx, animalId);
        const result = await tx.execute<{ deleted: boolean }>(
          sql`SELECT app.delete_unused_animal(${animalId}, interval '0') AS deleted`,
        );
        if (!result.rows[0]?.deleted)
          throw new DomainError("invalid_transition");
        await auditAnimal(tx, actor, "animal.deleted", animalId);
      });
    },
  };
}

export type PatientsService = ReturnType<typeof patientsService>;
