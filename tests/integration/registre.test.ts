import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createOrganization } from "../../db/seed/cabinets-fictifs";
import { createFakeDrVeto } from "@/adapters/drveto/fake";
import { DomainError } from "@/domains/equipe/actor";
import type { Actor } from "@/domains/equipe/actor";
import { isPermissionKey } from "@/domains/equipe/permissions";
import { patientsService } from "@/domains/patients/service";
import { protocolsService } from "@/domains/protocoles/service";
import { launchService } from "@/domains/suivis/lancement";

import { pools } from "./support/db";

const { app, admin, appDb } = pools();
afterAll(async () => {
  await app.end();
  await admin.end();
});

const patients = patientsService(appDb);
const launch = launchService({ db: appDb, drveto: createFakeDrVeto() });
const protocols = protocolsService(appDb);

const org = randomUUID();
const other = randomUUID();
const tag = org.slice(0, 8);
let ids: { admin: string; vet: string; assistant: string; outsider: string };

async function actor(
  membershipId: string,
  organizationId = org,
): Promise<Actor> {
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
  };
}

async function domainError(promise: Promise<unknown>) {
  try {
    await promise;
    return undefined;
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
}

/** Saisie telle que le formulaire l'envoie. */
function patient(
  name: string,
  owners: { fullName: string; phone: string; email?: string; id?: string }[],
  animal: Partial<Record<string, string>> = {},
) {
  return {
    animal: {
      name,
      species: "cat",
      breed: "",
      sex: "female",
      neutered: "no",
      birthDate: "2024-03-02",
      weightKg: "3,4",
      notes: "",
      ...animal,
    },
    owners: owners.map((owner) => ({
      id: owner.id ?? null,
      fullName: owner.fullName,
      phone: owner.phone,
      email: owner.email ?? "",
      language: "fr",
    })),
  };
}

beforeAll(async () => {
  const [adminId, vet, assistant] = await createOrganization(
    appDb,
    org,
    "Clinique d'essai du registre",
    [
      {
        email: `ra-${tag}@essai.test`,
        displayName: "Dr Rose Admin",
        role: "admin_vet",
      },
      {
        email: `rv-${tag}@essai.test`,
        displayName: "Dr Rémi Vet",
        role: "vet",
      },
      {
        email: `rs-${tag}@essai.test`,
        displayName: "Réa Asv",
        role: "assistant",
      },
    ],
  );
  const [outsider] = await createOrganization(appDb, other, "Autre cabinet", [
    {
      email: `ro-${tag}@essai.test`,
      displayName: "Dr Otto Autre",
      role: "admin_vet",
    },
  ]);
  if (!adminId || !vet || !assistant || !outsider) throw new Error("cabinet");
  ids = { admin: adminId, vet, assistant, outsider };
  // L'assistante prépare les suivis mais n'a pas la lecture clinique.
  await admin.query(
    "INSERT INTO membership_permissions (organization_id, membership_id, permission) VALUES ($1, $2, 'followups.launch')",
    [org, assistant],
  );
  const rose = await actor(adminId);
  for (const key of ["sterilisation-chatte", "detartrage"]) {
    const id = await protocols.installFromLibrary(rose, key);
    await protocols.validate(rose, id);
  }
});

let mina: string;

describe("registre des animaux", () => {
  it("enregistre un animal et deux propriétaires, numéros au format international", async () => {
    const remi = await actor(ids.vet);
    mina = await patients.create(
      remi,
      patient(
        "Mina",
        [
          {
            fullName: "Claire Morel",
            phone: "06 11 22 33 44",
            email: "Claire@Exemple.test",
          },
          { fullName: "Hugo Morel", phone: "+33 7 55 66 77 88" },
        ],
        { notes: "Craintive chez le vétérinaire." },
      ),
    );
    const record = await patients.get(remi, mina);
    expect(record).toMatchObject({
      name: "Mina",
      species: "cat",
      sex: "female",
      neutered: false,
      birthDate: "2024-03-02",
      weightGrams: 3400,
      notes: "Craintive chez le vétérinaire.",
      canDelete: true,
      openFollowupId: null,
    });
    expect(record.owners).toEqual([
      expect.objectContaining({
        fullName: "Claire Morel",
        phone: "+33611223344",
        email: "claire@exemple.test",
      }),
      expect.objectContaining({
        fullName: "Hugo Morel",
        phone: "+33755667788",
        email: null,
      }),
    ]);
  });

  it("refuse une saisie invalide et deux propriétaires au même numéro", async () => {
    const remi = await actor(ids.vet);
    expect(
      await domainError(
        patients.create(
          remi,
          patient("Zed", [{ fullName: "Al Bert", phone: "12" }]),
        ),
      ),
    ).toBe("invalid_target");
    expect(
      await domainError(
        patients.create(
          remi,
          patient("Zed", [
            { fullName: "Al Bert", phone: "0611223399" },
            { fullName: "Bea Bert", phone: "+33611223399" },
          ]),
        ),
      ),
    ).toBe("invalid_target");
    expect(
      await domainError(
        patients.create(
          remi,
          patient("Zed", [{ fullName: "Al Bert", phone: "0611223399" }], {
            birthDate: "2999-01-01",
          }),
        ),
      ),
    ).toBe("invalid_target");
  });

  it("rattache un nouvel animal au propriétaire qui a déjà ce numéro", async () => {
    const remi = await actor(ids.vet);
    const filou = await patients.create(
      remi,
      patient(
        "Filou",
        [{ fullName: "C. Morel (saisie différente)", phone: "0611223344" }],
        {
          species: "dog",
          sex: "male",
        },
      ),
    );
    const record = await patients.get(remi, filou);
    expect(record.owners.map((owner) => owner.fullName)).toEqual([
      "Claire Morel",
    ]);
  });

  it("cherche par nom, propriétaire ou numéro et filtre par espèce et statut", async () => {
    const remi = await actor(ids.vet);
    const names = async (filters: Parameters<typeof patients.list>[1]) =>
      (await patients.list(remi, filters)).map((row) => row.name);
    expect(await names({})).toEqual(["Filou", "Mina"]);
    expect(await names({ query: "min" })).toEqual(["Mina"]);
    expect(await names({ query: "hugo" })).toEqual(["Mina"]);
    expect(await names({ query: "55 66 77" })).toEqual(["Mina"]);
    expect(await names({ species: "dog" })).toEqual(["Filou"]);
    expect(await names({ query: "m%" })).toEqual([]);
    expect(await names({ status: "followed" })).toEqual([]);
    const [row] = await patients.list(remi, { query: "mina" });
    expect(row?.owners).toEqual(["Claire Morel", "Hugo Morel"]);
  });

  it("cache les notes sans lecture clinique et ne les efface pas à la modification", async () => {
    const rea = await actor(ids.assistant);
    const record = await patients.get(rea, mina);
    expect(record.notes).toBeNull();
    expect(record.notesHidden).toBe(true);
    await patients.update(
      rea,
      mina,
      patient(
        "Mina",
        record.owners.map((owner) => ({
          id: owner.id,
          fullName: owner.fullName,
          phone: owner.phone ?? "",
        })),
      ),
    );
    const remi = await actor(ids.vet);
    expect((await patients.get(remi, mina)).notes).toBe(
      "Craintive chez le vétérinaire.",
    );
  });

  it("modifie un numéro et retire le second propriétaire, effacé s'il ne sert plus", async () => {
    const remi = await actor(ids.vet);
    const before = await patients.get(remi, mina);
    const [claire, hugo] = before.owners;
    if (!claire || !hugo) throw new Error("propriétaires");
    await patients.update(
      remi,
      mina,
      patient("Mina", [
        { id: claire.id, fullName: "Claire Morel", phone: "0699887766" },
      ]),
    );
    const after = await patients.get(remi, mina);
    expect(after.owners).toEqual([
      expect.objectContaining({
        id: claire.id,
        phone: "+33699887766",
        email: null,
      }),
    ]);
    const { rows } = await admin.query(
      "SELECT (SELECT count(*) FROM owners WHERE id = $1)::int AS hugo, (SELECT count(*) FROM owner_contacts WHERE owner_id = $2 AND kind = 'whatsapp')::int AS numbers",
      [hugo.id, claire.id],
    );
    expect(rows[0]).toEqual({ hugo: 0, numbers: 1 });
  });

  it("refuse un propriétaire qui n'appartient pas à l'animal", async () => {
    const remi = await actor(ids.vet);
    expect(
      await domainError(
        patients.update(
          remi,
          mina,
          patient("Mina", [
            {
              id: randomUUID(),
              fullName: "Inconnu Total",
              phone: "0611000000",
            },
          ]),
        ),
      ),
    ).toBe("invalid_target");
  });
});

describe("lancer un suivi depuis la fiche", () => {
  let followupId: string;

  it("prépare un brouillon : protocole proposé, propriétaire comme contact principal", async () => {
    const remi = await actor(ids.vet);
    followupId = await launch.prepareFromAnimal(remi, mina, {
      procedure: "Stérilisation de la chatte",
      procedureAt: new Date("2026-10-14T08:00:00Z"),
      controlAppointmentAt: new Date("2026-10-24T08:00:00Z"),
      protocolId: null,
    });
    const sheet = await launch.sheet(remi, followupId);
    expect(sheet.followup).toMatchObject({
      status: "draft",
      animalName: "Mina",
      procedure: "Stérilisation de la chatte",
    });
    expect(sheet.imported).toBeNull();
    expect(sheet.protocol?.name).toMatch(/chatte/i);
    expect(sheet.steps.length).toBeGreaterThan(0);
    expect(sheet.contacts).toEqual([
      expect.objectContaining({
        name: "Claire Morel",
        role: "primary",
        active: true,
        optedIn: false,
      }),
    ]);
    const { rows } = await admin.query(
      "SELECT metadata FROM audit_events WHERE target_id = $1 AND action = 'followup.prepared'",
      [followupId],
    );
    expect(rows[0]?.metadata).toMatchObject({
      source: "manual",
      protocolSuggested: true,
    });
  });

  it("montre le suivi dans le registre et l'historique ; un second brouillon est refusé", async () => {
    const remi = await actor(ids.vet);
    const [row] = await patients.list(remi, { status: "followed" });
    expect(row).toMatchObject({
      name: "Mina",
      openFollowup: { id: followupId, status: "draft", visible: true },
    });
    const record = await patients.get(remi, mina);
    expect(record.history).toEqual([
      expect.objectContaining({
        id: followupId,
        access: "clinical",
        procedure: "Stérilisation de la chatte",
      }),
    ]);
    expect(record.canDelete).toBe(false);
    expect(
      await domainError(
        launch.prepareFromAnimal(remi, mina, {
          procedure: "Détartrage",
          procedureAt: new Date(),
          controlAppointmentAt: null,
          protocolId: null,
        }),
      ),
    ).toBe("already_followed");
  });

  it("refuse l'archivage et la suppression tant que l'animal a un suivi", async () => {
    const remi = await actor(ids.vet);
    expect(await domainError(patients.setArchived(remi, mina, true))).toBe(
      "invalid_transition",
    );
    expect(await domainError(patients.remove(remi, mina))).toBe(
      "invalid_transition",
    );
  });

  it("n'accepte qu'un protocole validé de la bonne espèce", async () => {
    const remi = await actor(ids.vet);
    const [filou] = await patients.list(remi, { query: "filou" });
    if (!filou) throw new Error("Filou");
    const options = await launch.protocolOptions(remi, "dog");
    expect(options.map((option) => option.name).join(" ")).not.toMatch(
      /chatte/i,
    );
    const catOnly = (await launch.protocolOptions(remi, "cat")).find((option) =>
      /chatte/i.test(option.name),
    );
    expect(
      await domainError(
        launch.prepareFromAnimal(remi, filou.id, {
          procedure: "Détartrage",
          procedureAt: new Date(),
          controlAppointmentAt: null,
          protocolId: catOnly?.id ?? randomUUID(),
        }),
      ),
    ).toBe("invalid_target");
  });

  it("demande la lecture clinique pour préparer un suivi", async () => {
    const rea = await actor(ids.assistant);
    expect(await domainError(launch.protocolOptions(rea, "cat"))).toBe(
      "not_found",
    );
  });
});

describe("archivage, suppression et conservation", () => {
  it("archive puis restaure un animal sans suivi ; un animal archivé ne se modifie pas", async () => {
    const remi = await actor(ids.vet);
    const [filou] = await patients.list(remi, { query: "filou" });
    if (!filou) throw new Error("Filou");
    await patients.setArchived(remi, filou.id, true);
    expect((await patients.list(remi, {})).map((row) => row.name)).toEqual([
      "Mina",
    ]);
    expect(
      (await patients.list(remi, { status: "archived" })).map(
        (row) => row.name,
      ),
    ).toEqual(["Filou"]);
    expect(
      await domainError(
        launch.prepareFromAnimal(remi, filou.id, {
          procedure: "Détartrage",
          procedureAt: new Date(),
          controlAppointmentAt: null,
          protocolId: null,
        }),
      ),
    ).toBe("invalid_transition");
    expect(
      await domainError(
        patients.update(
          remi,
          filou.id,
          patient("Filou", [{ fullName: "Claire Morel", phone: "0699887766" }]),
        ),
      ),
    ).toBe("invalid_transition");
    await patients.setArchived(remi, filou.id, false);
    expect((await patients.get(remi, filou.id)).archivedAt).toBeNull();
  });

  it("supprime un animal jamais suivi, sans effacer un propriétaire encore utile", async () => {
    const remi = await actor(ids.vet);
    const [filou] = await patients.list(remi, { query: "filou" });
    if (!filou) throw new Error("Filou");
    await patients.remove(remi, filou.id);
    expect(await domainError(patients.get(remi, filou.id))).toBe("not_found");
    expect((await patients.get(remi, mina)).owners).toHaveLength(1);
  });

  it("efface un animal resté sans suivi seulement après quinze mois", async () => {
    const remi = await actor(ids.vet);
    const old = await patients.create(
      remi,
      patient("Vieux", [{ fullName: "Ana Vieux", phone: "0612121212" }]),
    );
    const purge = (minAge: string) =>
      admin.query("BEGIN").then(async () => {
        await admin.query(
          "SELECT set_config('app.organization_id', $1, true)",
          [org],
        );
        const { rows } = await admin.query(
          "SELECT app.delete_unused_animal($1, $2::interval) AS deleted",
          [old, minAge],
        );
        await admin.query("COMMIT");
        return rows[0]?.deleted as boolean;
      });
    expect(await purge("15 months")).toBe(false);
    await admin.query(
      "UPDATE animals SET created_at = now() - interval '16 months' WHERE id = $1",
      [old],
    );
    expect(await purge("15 months")).toBe(true);
    const { rows } = await admin.query(
      "SELECT count(*)::int AS n FROM owners WHERE organization_id = $1 AND full_name = 'Ana Vieux'",
      [org],
    );
    expect(rows[0]?.n).toBe(0);
  });
});

describe("isolation entre cabinets et droits", () => {
  it("un autre cabinet ne voit, ne modifie ni ne lance rien sur nos animaux", async () => {
    const otto = await actor(ids.outsider, other);
    expect(await patients.list(otto, {})).toEqual([]);
    expect(await patients.list(otto, { query: "mina" })).toEqual([]);
    expect(await domainError(patients.get(otto, mina))).toBe("not_found");
    expect(
      await domainError(
        patients.update(
          otto,
          mina,
          patient("Pirate", [{ fullName: "Pi Rate", phone: "0600000001" }]),
        ),
      ),
    ).toBe("not_found");
    expect(await domainError(patients.setArchived(otto, mina, true))).toBe(
      "not_found",
    );
    expect(await domainError(patients.remove(otto, mina))).toBe("not_found");
    expect(
      await domainError(
        launch.prepareFromAnimal(otto, mina, {
          procedure: "Détartrage",
          procedureAt: new Date(),
          controlAppointmentAt: null,
          protocolId: null,
        }),
      ),
    ).toBe("not_found");
  });

  it("un numéro connu d'un autre cabinet n'y rattache pas le propriétaire", async () => {
    const otto = await actor(ids.outsider, other);
    const id = await patients.create(
      otto,
      patient("Rex", [{ fullName: "Paul Autre", phone: "0699887766" }]),
    );
    expect(
      (await patients.get(otto, id)).owners.map((owner) => owner.fullName),
    ).toEqual(["Paul Autre"]);
  });

  it("refuse le registre sans droit de préparation", async () => {
    const remi = await actor(ids.vet);
    const plain: Actor = {
      ...remi,
      permissions: new Set(
        [...remi.permissions].filter((key) => key !== "followups.launch"),
      ),
    };
    expect(await domainError(patients.list(plain, {}))).toBe("not_found");
    expect(await domainError(patients.get(plain, mina))).toBe("not_found");
  });

  it("journalise sans nom ni numéro", async () => {
    const { rows } = await admin.query(
      "SELECT action, metadata::text AS metadata FROM audit_events WHERE organization_id = $1 AND target_type = 'animal' ORDER BY occurred_at",
      [org],
    );
    const actions = new Set(rows.map((row: { action: string }) => row.action));
    for (const action of [
      "animal.created",
      "animal.viewed",
      "animal.updated",
      "animal.archived",
      "animal.restored",
      "animal.deleted",
    ])
      expect(actions).toContain(action);
    for (const row of rows as { metadata: string }[])
      expect(row.metadata).not.toMatch(/Morel|Mina|\+33|@/);
  });
});
