import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";

import {
  cabinet as tilleuls,
  followups as tilleulsFollowups,
  vets,
} from "../../src/fixtures/cabinet-tilleuls";
import { SEED } from "../../src/fixtures/seed-ids";
import type { Followup } from "../../src/fixtures/types";
import {
  animalOwners,
  animals,
  auditEvents,
  followups,
  memberships,
  organizations,
  ownerContacts,
  owners,
  protocols,
  users,
} from "../../src/server/db/schema";
import { hashPassword } from "../../src/domains/auth/password";
import type { Actor } from "../../src/domains/equipe/actor";
import { ROLE_PERMISSIONS } from "../../src/domains/equipe/permissions";
import { PROTOCOL_LIBRARY } from "../../src/domains/protocoles/library";
import { protocolsService } from "../../src/domains/protocoles/service";
import { withTenant } from "../../src/server/db/tenant";
import type { Database, TenantTransaction } from "../../src/server/db/tenant";

/**
 * Jeu de données 100 % fictif : deux cabinets pour éprouver l'isolation.
 * Adresses e-mail en `.test` (domaine réservé, jamais routable).
 */
export { SEED };

/**
 * Phrase de passe commune à tous les comptes fictifs, pour se connecter en local et en CI.
 * Ces comptes n'existent que dans une base locale (le seed refuse tout autre environnement).
 */
export const FICTIONAL_LOGIN_PHRASE = "tilleuls fictifs en local";

type MemberSeed = {
  email: string;
  displayName: string;
  role: "admin_vet" | "vet" | "assistant";
};

export async function createOrganization(
  db: Database,
  id: string,
  name: string,
  members: MemberSeed[],
) {
  await withTenant(db, { organizationId: id }, (tx) =>
    tx.insert(organizations).values({ id, name }),
  );

  const membershipIds: string[] = [];
  const passwordHash = await hashPassword(FICTIONAL_LOGIN_PHRASE);
  for (const member of members) {
    const userId = randomUUID();
    const membershipId = randomUUID();
    // Une personne se crée elle-même (app.user_id) avant de rejoindre le cabinet.
    await withTenant(db, { organizationId: id, userId }, async (tx) => {
      await tx.insert(users).values({
        id: userId,
        email: member.email,
        displayName: member.displayName,
      });
      await tx.insert(memberships).values({
        id: membershipId,
        organizationId: id,
        userId,
        role: member.role,
      });
      await tx.execute(
        sql`SELECT auth.set_initial_password(${userId}, ${passwordHash})`,
      );
      await tx.insert(auditEvents).values({
        organizationId: id,
        actorMembershipId: membershipId,
        action: "membership.created",
        targetType: "membership",
        targetId: membershipId,
        metadata: { role: member.role, source: "seed" },
      });
    });
    membershipIds.push(membershipId);
  }
  return membershipIds;
}

const statusOf: Record<
  Followup["state"],
  "active" | "paused" | "human_takeover" | "ended"
> = {
  active: "active",
  paused: "paused",
  human: "human_takeover",
  ended: "ended",
};

function daysAgo(dayLabel: string): Date {
  const days = Number(/J\+?(\d+)/.exec(dayLabel)?.[1] ?? 0);
  return new Date(Date.now() - days * 24 * 3600 * 1000);
}

function grams(weight: string): number {
  return Math.round(
    Number(weight.replace(",", ".").replace(/[^\d.]/g, "")) * 1000,
  );
}

export async function insertFollowup(
  tx: TenantTransaction,
  organizationId: string,
  responsibleMembershipId: string,
  data: Followup,
  protocolVersionId: string | null = null,
) {
  const [animal] = await tx
    .insert(animals)
    .values({
      organizationId,
      name: data.animal.name,
      species: data.animal.species === "chat" ? "cat" : "dog",
      breed: data.animal.breed,
      weightGrams: grams(data.animal.weight),
    })
    .returning({ id: animals.id });
  if (!animal) throw new Error("Insertion de l'animal impossible");

  for (const contact of data.owners) {
    const [owner] = await tx
      .insert(owners)
      .values({
        organizationId,
        fullName: contact.name,
        preferredLanguage: contact.language,
      })
      .returning({ id: owners.id });
    if (!owner) throw new Error("Insertion du propriétaire impossible");
    await tx.insert(ownerContacts).values({
      organizationId,
      ownerId: owner.id,
      kind: "whatsapp",
      value: contact.phone,
    });
    await tx
      .insert(animalOwners)
      .values({ organizationId, animalId: animal.id, ownerId: owner.id });
  }

  const startedAt = daysAgo(data.dayLabel);
  await tx.insert(followups).values({
    id: data.id,
    organizationId,
    animalId: animal.id,
    responsibleMembershipId,
    procedure: data.procedure,
    procedureAt: startedAt,
    status: statusOf[data.state],
    triage: data.triage,
    isPrivate: data.isPrivate,
    startedAt,
    protocolVersionId,
  });
}

/** Membre du jeu fictif agissant avec les droits par défaut de son rôle. */
async function seedActor(
  db: Database,
  organizationId: string,
  membershipId: string,
): Promise<Actor> {
  const [member] = await withTenant(db, { organizationId }, (tx) =>
    tx
      .select({ userId: memberships.userId, role: memberships.role })
      .from(memberships)
      .where(eq(memberships.id, membershipId)),
  );
  if (!member) throw new Error("Membre fictif introuvable");
  return {
    organizationId,
    userId: member.userId,
    membershipId,
    role: member.role,
    permissions: new Set(ROLE_PERMISSIONS[member.role].defaults),
  };
}

/** Modèle de la bibliothèque correspondant à l'intervention d'un suivi fictif. */
function libraryKeyFor(followup: Followup): string | null {
  if (/ovariectomie|stérilisation/i.test(followup.procedure))
    return followup.animal.species === "chat"
      ? "sterilisation-chatte"
      : "sterilisation-chienne";
  if (/détartrage/i.test(followup.procedure)) return "detartrage";
  if (/traitement/i.test(followup.procedure)) return "suivi-traitement";
  return null;
}

/**
 * Protocoles des Tilleuls : la bibliothèque de départ, validée par Claire sauf la castration
 * (laissée « à valider »), et un protocole personnel de Hugo.
 */
async function seedProtocols(db: Database, claire: Actor, hugo: Actor) {
  const service = protocolsService(db);
  for (const { key } of PROTOCOL_LIBRARY) {
    const id = await service.installFromLibrary(claire, key);
    if (key !== "castration-chien") await service.validate(claire, id);
  }
  const versions = await withTenant(
    db,
    { organizationId: claire.organizationId },
    (tx) =>
      tx
        .select({
          key: protocols.libraryKey,
          versionId: protocols.currentVersionId,
          id: protocols.id,
        })
        .from(protocols),
  );
  const castration = versions.find((row) => row.key === "castration-chien");
  if (castration) {
    const copy = await service.duplicate(hugo, castration.id, "personal");
    const detail = await service.get(hugo, copy);
    await service.update(
      hugo,
      copy,
      {
        ...detail.version.content,
        name: "Castration du chien (Dr Marchal)",
        durationDays: 14,
      },
      "Suivi prolongé à 14 jours",
    );
  }
  return new Map(
    versions.flatMap((row) =>
      row.key && row.versionId ? [[row.key, row.versionId] as const] : [],
    ),
  );
}

export async function seedFictionalCabinets(db: Database) {
  const tilleulsMembers = await createOrganization(
    db,
    SEED.tilleuls,
    tilleuls.name,
    [
      {
        email: "claire.fontaine@tilleuls.test",
        displayName: "Dr Claire Fontaine",
        role: "admin_vet",
      },
      {
        email: "hugo.marchal@tilleuls.test",
        displayName: "Dr Hugo Marchal",
        role: "vet",
      },
      {
        email: "ines.benali@tilleuls.test",
        displayName: "Dr Inès Benali",
        role: "vet",
      },
      {
        email: "lea.roux@tilleuls.test",
        displayName: "Léa Roux",
        role: "assistant",
      },
    ],
  );
  const membershipByVet = new Map(
    vets.map((vet, index) => [vet.id, tilleulsMembers[index]]),
  );

  const [claireId, hugoId] = tilleulsMembers;
  if (!claireId || !hugoId) throw new Error("Cabinet des Tilleuls incomplet");
  const versionByKey = await seedProtocols(
    db,
    await seedActor(db, SEED.tilleuls, claireId),
    await seedActor(db, SEED.tilleuls, hugoId),
  );

  await withTenant(db, { organizationId: SEED.tilleuls }, async (tx) => {
    for (const followup of tilleulsFollowups) {
      const responsible = membershipByVet.get(followup.responsibleVetId);
      if (!responsible)
        throw new Error(`Vétérinaire inconnu : ${followup.responsibleVetId}`);
      const key = libraryKeyFor(followup);
      await insertFollowup(
        tx,
        SEED.tilleuls,
        responsible,
        followup,
        key ? (versionByKey.get(key) ?? null) : null,
      );
    }
  });

  const [martin] = await createOrganization(
    db,
    SEED.martin,
    "Cabinet vétérinaire du Dr Martin",
    [
      {
        email: "paul.martin@cabinet-martin.test",
        displayName: "Dr Paul Martin",
        role: "admin_vet",
      },
    ],
  );
  if (!martin) throw new Error("Cabinet du Dr Martin incomplet");

  await withTenant(db, { organizationId: SEED.martin }, (tx) =>
    insertFollowup(tx, SEED.martin, martin, {
      ...structuredClone(tilleulsFollowups[1]!),
      id: "e3a9c4d1-8b2f-4e67-a0d5-2c7f1b9e6a38",
      animal: {
        name: "Sushi",
        species: "chat",
        breed: "Siamois",
        age: "3 ans",
        weight: "3,9 kg",
      },
      owners: [
        {
          name: "Élodie Masson",
          phone: "06 39 98 33 90",
          role: "principal",
          consent: "given",
          language: "fr",
        },
      ],
    }),
  );
}
