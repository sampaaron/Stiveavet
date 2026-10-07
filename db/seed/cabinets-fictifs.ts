import { randomUUID } from "node:crypto";

import {
  cabinet as tilleuls,
  followups as tilleulsFollowups,
  vets,
} from "../../src/fixtures/cabinet-tilleuls";
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
  users,
} from "../../src/server/db/schema";
import { withTenant } from "../../src/server/db/tenant";
import type { Database, TenantTransaction } from "../../src/server/db/tenant";

/**
 * Jeu de données 100 % fictif : deux cabinets pour éprouver l'isolation.
 * Adresses e-mail en `.test` (domaine réservé, jamais routable).
 */
export const SEED = {
  tilleuls: "0b9f2c11-6a3e-4d27-9c40-5e1d8a7b3f01",
  martin: "7c4e1a90-2b5d-4f38-8e16-9a0c3d2b1e02",
} as const;

type MemberSeed = {
  email: string;
  displayName: string;
  role: "admin_vet" | "vet" | "assistant";
};

async function createOrganization(
  db: Database,
  id: string,
  name: string,
  members: MemberSeed[],
) {
  await withTenant(db, { organizationId: id }, (tx) =>
    tx.insert(organizations).values({ id, name }),
  );

  const membershipIds: string[] = [];
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

async function insertFollowup(
  tx: TenantTransaction,
  organizationId: string,
  responsibleMembershipId: string,
  data: Followup,
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
  });
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

  await withTenant(db, { organizationId: SEED.tilleuls }, async (tx) => {
    for (const followup of tilleulsFollowups) {
      const responsible = membershipByVet.get(followup.responsibleVetId);
      if (!responsible)
        throw new Error(`Vétérinaire inconnu : ${followup.responsibleVetId}`);
      await insertFollowup(tx, SEED.tilleuls, responsible, followup);
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
