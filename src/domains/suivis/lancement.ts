import { randomUUID } from "node:crypto";

import { and, asc, eq, gt, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod";

import type { DrVetoAnimalHit, DrVetoConnector } from "@/adapters/drveto/types";
import { DomainError, assertPermission } from "@/domains/equipe/actor";
import type { Actor } from "@/domains/equipe/actor";
import { VET_ROLES } from "@/domains/equipe/permissions";
import { recordUsage } from "@/domains/facturation/service";
import { canReadProtocol } from "@/domains/protocoles/policies";
import { MAX_STEPS } from "@/domains/protocoles/content";
import { emit, enqueue } from "@/domains/taches/queue";
import { maskPhone } from "@/domains/whatsapp/numero";
import {
  alertRules,
  animalOwners,
  animals,
  consents,
  followupAlertRules,
  followupContacts,
  followupImports,
  followupShares,
  followupSteps,
  followupTreatments,
  followups,
  integrationConnections,
  memberships,
  ownerContacts,
  owners,
  protocolSteps,
  protocolVersions,
  protocols,
  scheduledJobs,
  users,
} from "@/server/db/schema";
import { tenantRunner } from "@/server/db/tenant";
import type { Database, TenantTransaction } from "@/server/db/tenant";
import { auditFollowup as audit } from "@/domains/audit/journal";

import { nextSendTime } from "./envoi";
import {
  messageWindows,
  programmeOf,
  scheduleAutomaticEnd,
  scheduleReminders,
} from "./rappels";
import type { ProgrammeView } from "./rappels";
import {
  FIRST_CONTACT_SUGGESTION_HOURS,
  MAX_TREATMENTS,
  firstContactAt,
  firstContactHours,
  fitsSpecies,
  isPastStep,
  sheetInput,
  stepDueAt,
  suggestProtocol,
} from "./plan";
import {
  canLaunchFollowup,
  canPrepareFollowup,
  canSteerFollowup,
  followupAccess,
} from "./policies";
import type { FollowupAccess } from "./policies";

/**
 * Lancement manuel d'un suivi (cahier des charges §4 et §5, ADR 0015) :
 * 1. recherche de l'animal dans dr.veto, import en lecture seule du résumé utile ;
 * 2. fiche de lancement modifiable (protocole, premier message, étapes, signes d'alerte,
 *    traitements, contrôle), préparée par un vétérinaire ou un assistant autorisé ;
 * 3. « Lancer le suivi » par le vétérinaire responsable : version de protocole figée, usage
 *    facturable enregistré, premier message de Numa planifié ;
 * 4. modification, pause, arrêt et reprise par un vétérinaire.
 * Chaque étape est journalisée ; le journal ne garde que des identifiants et des compteurs.
 */

type Status = "draft" | "active" | "paused" | "human_takeover" | "ended";

export type StatusChange = "pause" | "resume" | "stop" | "reactivate";

export type DrVetoSearchHit = DrVetoAnimalHit & {
  /** Suivi en préparation ou en cours pour cet animal, s'il existe. */
  openFollowupId: string | null;
};

export type SheetStep = {
  offsetHours: number;
  kind: "message" | "question" | "photo_request" | "reminder" | "control";
  content: string;
  dueAt: Date;
  /** Heure passée sur un suivi lancé : l'étape ne se modifie plus. */
  locked: boolean;
};

export type SheetTreatment = {
  id: string;
  source: "drveto" | "vet";
  name: string;
  instructions: string;
  validatedBy: string | null;
  validatedAt: Date | null;
};

export type LaunchSheet = {
  followup: {
    id: string;
    status: Status;
    isTest: boolean;
    animalName: string;
    species: "dog" | "cat";
    breed: string | null;
    procedure: string;
    procedureAt: Date;
    controlAppointmentAt: Date | null;
    firstContactAt: Date | null;
    firstContactHours: number;
    startedAt: Date | null;
    responsibleMembershipId: string;
    responsibleName: string;
    planRevision: number;
  };
  imported: {
    externalRef: string;
    importedAt: Date;
    allergies: string[];
    antecedents: string[];
  } | null;
  contacts: {
    name: string;
    role: "primary" | "secondary";
    active: boolean;
    phone: string;
    language: "fr" | "en";
    /** Accord pour WhatsApp recueilli au cabinet (ADR 0024). */
    optedIn: boolean;
  }[];
  treatments: SheetTreatment[];
  protocol: {
    protocolId: string;
    versionId: string;
    name: string;
    versionNumber: number;
  } | null;
  steps: SheetStep[];
  alerts: { level: "watch" | "urgent"; description: string }[];
  /** Brouillon : protocoles validés applicables à l'espèce. */
  protocolOptions: {
    protocolId: string;
    name: string;
    versionNumber: number;
  }[];
  /** Brouillon : vétérinaires actifs pouvant être responsables. */
  vetOptions: { membershipId: string; name: string }[];
  /** Heure de construction de la fiche (étapes passées, premier message immédiat). */
  generatedAt: Date;
  rights: {
    /** Modifier la fiche (brouillon : préparation ; suivi lancé : vétérinaire). */
    canEdit: boolean;
    /** Valider ou retirer un traitement, pause, arrêt, reprise. */
    canSteer: boolean;
    canLaunch: boolean;
  };
};

const uuid = z.uuid();
const searchQuery = z.string().trim().min(2).max(80);
const drVetoRef = z.string().regex(/^[A-Za-z0-9-]{3,64}$/);

const TRANSITIONS: Record<
  StatusChange,
  { from: readonly Status[]; to: Status; reason: string; action: string }
> = {
  pause: {
    from: ["active", "human_takeover"],
    to: "paused",
    reason: "vet_paused",
    action: "followup.paused",
  },
  resume: {
    from: ["paused"],
    to: "active",
    reason: "vet_resumed",
    action: "followup.resumed",
  },
  stop: {
    from: ["active", "paused", "human_takeover"],
    to: "ended",
    reason: "vet_stopped",
    action: "followup.stopped",
  },
  reactivate: {
    from: ["ended"],
    to: "active",
    reason: "vet_reactivated",
    action: "followup.reactivated",
  },
};

async function isConnected(
  tx: TenantTransaction,
  provider: "whatsapp" | "drveto",
): Promise<boolean> {
  const [row] = await tx
    .select({ provider: integrationConnections.provider })
    .from(integrationConnections)
    .where(eq(integrationConnections.provider, provider));
  return Boolean(row);
}

export async function setStatusReason(tx: TenantTransaction, reason: string) {
  await tx.execute(
    sql`SELECT set_config('app.status_reason', ${reason}, true)`,
  );
}

export type LoadedFollowup = {
  id: string;
  status: Status;
  isTest: boolean;
  isPrivate: boolean;
  animalId: string;
  animalName: string;
  species: "dog" | "cat";
  breed: string | null;
  procedure: string;
  procedureAt: Date;
  controlAppointmentAt: Date | null;
  firstContactAt: Date | null;
  startedAt: Date | null;
  responsibleMembershipId: string;
  protocolVersionId: string | null;
  planRevision: number;
  access: FollowupAccess;
};

/**
 * Suivi et niveau d'accès de l'acteur. Inexistant, autre cabinet ou invisible : not_found,
 * comme partout ailleurs. `lock` verrouille la ligne pour un changement d'état.
 */
export async function loadFollowup(
  tx: TenantTransaction,
  actor: Actor,
  followupId: string,
  lock = false,
): Promise<LoadedFollowup> {
  if (!uuid.safeParse(followupId).success) throw new DomainError("not_found");
  if (lock)
    await tx
      .select({ id: followups.id })
      .from(followups)
      .where(eq(followups.id, followupId))
      .for("update");
  const [row] = await tx
    .select({
      id: followups.id,
      status: followups.status,
      isTest: followups.isTest,
      isPrivate: followups.isPrivate,
      animalId: followups.animalId,
      animalName: animals.name,
      species: animals.species,
      breed: animals.breed,
      procedure: followups.procedure,
      procedureAt: followups.procedureAt,
      controlAppointmentAt: followups.controlAppointmentAt,
      firstContactAt: followups.firstContactAt,
      startedAt: followups.startedAt,
      responsibleMembershipId: followups.responsibleMembershipId,
      protocolVersionId: followups.protocolVersionId,
      planRevision: followups.planRevision,
    })
    .from(followups)
    .innerJoin(animals, eq(animals.id, followups.animalId))
    .where(eq(followups.id, followupId));
  if (!row) throw new DomainError("not_found");
  const now = new Date();
  const shares = await tx
    .select({ membershipId: followupShares.membershipId })
    .from(followupShares)
    .where(
      and(
        eq(followupShares.followupId, followupId),
        isNull(followupShares.revokedAt),
        or(isNull(followupShares.expiresAt), gt(followupShares.expiresAt, now)),
      ),
    );
  const access = followupAccess(actor, {
    responsibleMembershipId: row.responsibleMembershipId,
    isPrivate: row.isPrivate,
    sharedWith: shares.map((share) => share.membershipId),
  });
  if (access === "none") throw new DomainError("not_found");
  return { ...row, access };
}

/** Protocoles validés, non archivés et lisibles par l'acteur. */
async function protocolChoices(tx: TenantTransaction, actor: Actor) {
  const rows = await tx
    .select({
      protocolId: protocols.id,
      ownerMembershipId: protocols.ownerMembershipId,
      versionId: protocolVersions.id,
      versionNumber: protocolVersions.versionNumber,
      name: protocolVersions.name,
      description: protocolVersions.description,
      species: protocolVersions.species,
      validatedAt: protocolVersions.validatedAt,
    })
    .from(protocols)
    .innerJoin(
      protocolVersions,
      eq(protocolVersions.id, protocols.currentVersionId),
    )
    .where(isNull(protocols.archivedAt))
    .orderBy(asc(protocolVersions.name));
  return rows.filter(
    (row) => row.validatedAt !== null && canReadProtocol(actor, row),
  );
}

async function activeVets(tx: TenantTransaction) {
  return tx
    .select({ membershipId: memberships.id, name: users.displayName })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        isNull(memberships.deactivatedAt),
        inArray(memberships.role, ["admin_vet", "vet"]),
      ),
    )
    .orderBy(asc(users.displayName));
}

/** Copie les étapes et signes d'alerte d'une version de protocole dans une nouvelle révision. */
export async function copyProtocolPlan(
  tx: TenantTransaction,
  organizationId: string,
  followupId: string,
  versionId: string,
  revision: number,
  now: Date,
) {
  await tx
    .update(followupSteps)
    .set({ supersededAt: now })
    .where(
      and(
        eq(followupSteps.followupId, followupId),
        isNull(followupSteps.supersededAt),
      ),
    );
  await tx
    .update(followupAlertRules)
    .set({ supersededAt: now })
    .where(
      and(
        eq(followupAlertRules.followupId, followupId),
        isNull(followupAlertRules.supersededAt),
      ),
    );
  const steps = await tx
    .select()
    .from(protocolSteps)
    .where(eq(protocolSteps.protocolVersionId, versionId))
    .orderBy(asc(protocolSteps.position));
  const rules = await tx
    .select()
    .from(alertRules)
    .where(eq(alertRules.protocolVersionId, versionId))
    .orderBy(asc(alertRules.position));
  if (steps.length)
    await tx.insert(followupSteps).values(
      steps.map((step, index) => ({
        organizationId,
        followupId,
        revision,
        position: index + 1,
        offsetHours: step.offsetHours,
        kind: step.kind,
        content: step.content,
      })),
    );
  if (rules.length)
    await tx.insert(followupAlertRules).values(
      rules.map((rule, index) => ({
        organizationId,
        followupId,
        revision,
        position: index + 1,
        level: rule.level,
        description: rule.description,
      })),
    );
  return { steps: steps.length, alerts: rules.length };
}

async function currentSteps(tx: TenantTransaction, followupId: string) {
  return tx
    .select()
    .from(followupSteps)
    .where(
      and(
        eq(followupSteps.followupId, followupId),
        isNull(followupSteps.supersededAt),
      ),
    )
    .orderBy(asc(followupSteps.offsetHours), asc(followupSteps.position));
}

async function currentAlerts(tx: TenantTransaction, followupId: string) {
  return tx
    .select()
    .from(followupAlertRules)
    .where(
      and(
        eq(followupAlertRules.followupId, followupId),
        isNull(followupAlertRules.supersededAt),
      ),
    )
    .orderBy(asc(followupAlertRules.position));
}

/**
 * Traitements qu'un rappel peut citer : validés par un vétérinaire et non retirés. Un
 * traitement importé de dr.veto n'est jamais rappelé avant cette validation.
 */
export async function reminderTreatments(
  tx: TenantTransaction,
  followupId: string,
) {
  return tx
    .select({
      id: followupTreatments.id,
      name: followupTreatments.name,
      instructions: followupTreatments.instructions,
    })
    .from(followupTreatments)
    .where(
      and(
        eq(followupTreatments.followupId, followupId),
        isNull(followupTreatments.removedAt),
        sql`${followupTreatments.validatedAt} IS NOT NULL`,
      ),
    )
    .orderBy(asc(followupTreatments.createdAt));
}

/** Propriétaire déjà rattaché à l'animal (même nom), sinon nouveau ; contact WhatsApp assuré. */
async function upsertOwner(
  tx: TenantTransaction,
  organizationId: string,
  animalId: string,
  owner: { fullName: string; phone: string; language: "fr" | "en" },
) {
  const [existing] = await tx
    .select({ id: owners.id })
    .from(owners)
    .innerJoin(animalOwners, eq(animalOwners.ownerId, owners.id))
    .where(
      and(
        eq(animalOwners.animalId, animalId),
        eq(owners.fullName, owner.fullName),
      ),
    );
  let ownerId = existing?.id;
  if (!ownerId) {
    const [created] = await tx
      .insert(owners)
      .values({
        organizationId,
        fullName: owner.fullName,
        preferredLanguage: owner.language,
      })
      .returning({ id: owners.id });
    if (!created) throw new Error("Propriétaire non créé");
    ownerId = created.id;
    await tx.insert(animalOwners).values({ organizationId, animalId, ownerId });
  }
  await tx
    .insert(ownerContacts)
    .values({ organizationId, ownerId, kind: "whatsapp", value: owner.phone })
    .onConflictDoNothing();
  const [contact] = await tx
    .select({ id: ownerContacts.id })
    .from(ownerContacts)
    .where(
      and(
        eq(ownerContacts.ownerId, ownerId),
        eq(ownerContacts.kind, "whatsapp"),
        eq(ownerContacts.value, owner.phone),
      ),
    );
  if (!contact) throw new Error("Contact non créé");
  return { ownerId, ownerContactId: contact.id };
}

/**
 * Planifie le premier message de Numa : à l'heure choisie par le vétérinaire, ou tout de
 * suite si elle est passée, toujours dans la plage d'envoi du cabinet (cahier des charges
 * §3.5). Rien ne part pour un suivi test. `attempt` distingue une replanification après une
 * pause ou une réactivation ; le message lui-même reste unique (clé du message, ADR 0016).
 */
async function scheduleIntro(
  tx: TenantTransaction,
  organizationId: string,
  followup: { id: string; firstContactAt: Date | null },
  now: Date,
  attempt?: string,
) {
  // Premier message déjà envoyé : une demande d'accord existe.
  const [sent] = await tx
    .select({ id: consents.id })
    .from(consents)
    .where(eq(consents.followupId, followup.id))
    .limit(1);
  if (sent) return;
  const wanted =
    followup.firstContactAt && followup.firstContactAt.getTime() > now.getTime()
      ? followup.firstContactAt
      : now;
  await enqueue(tx, {
    organizationId,
    kind: "followup.message",
    idempotencyKey: attempt
      ? `followup:${followup.id}:intro:${attempt}`
      : `followup:${followup.id}:intro`,
    runAt: nextSendTime(await messageWindows(tx), wanted),
    followupId: followup.id,
    payload: { step: "intro" },
  });
}

export function launchService(deps: { db: Database; drveto: DrVetoConnector }) {
  const { db, drveto } = deps;
  const run = tenantRunner(db);

  /** Préparer une fiche demande le droit de lancement et la lecture clinique (allergies…). */
  function assertCanPrepare(actor: Actor) {
    assertPermission(actor, "followups.launch");
    assertPermission(actor, "clinical.read");
  }

  async function launchInTx(
    tx: TenantTransaction,
    actor: Actor,
    followupId: string,
    now: Date,
  ) {
    const followup = await loadFollowup(tx, actor, followupId, true);
    if (followup.status !== "draft")
      throw new DomainError("invalid_transition");
    if (
      !canLaunchFollowup(
        actor,
        followup.access,
        followup.responsibleMembershipId,
      )
    )
      throw new DomainError("forbidden");
    if (!followup.protocolVersionId || !followup.firstContactAt)
      throw new DomainError("launch_incomplete");
    const [version] = await tx
      .select({ validatedAt: protocolVersions.validatedAt })
      .from(protocolVersions)
      .where(eq(protocolVersions.id, followup.protocolVersionId));
    const steps = await currentSteps(tx, followupId);
    const alerts = await currentAlerts(tx, followupId);
    if (!version?.validatedAt || !steps.length || !alerts.length)
      throw new DomainError("launch_incomplete");
    // Un suivi test n'envoie rien : il ne demande ni WhatsApp ni facturation.
    if (!followup.isTest && !(await isConnected(tx, "whatsapp")))
      throw new DomainError("integration_missing");
    // Pas de premier message sans l'accord pour WhatsApp, recueilli au cabinet.
    if (!followup.isTest) {
      const [missing] = await tx
        .select({ id: followupContacts.id })
        .from(followupContacts)
        .where(
          and(
            eq(followupContacts.followupId, followupId),
            eq(followupContacts.active, true),
            isNull(followupContacts.whatsappOptinAt),
          ),
        )
        .limit(1);
      if (missing) throw new DomainError("optin_missing");
    }

    await setStatusReason(tx, "launched");
    await tx
      .update(followups)
      .set({ status: "active", startedAt: now })
      .where(eq(followups.id, followupId));
    if (!followup.isTest) {
      await recordUsage(
        tx,
        actor.organizationId,
        { followupId, kind: "launch", idempotencyKey: `launch:${followupId}` },
        now,
      );
      // Premier message de Numa, au nom du cabinet et du vétérinaire responsable.
      await scheduleIntro(tx, actor.organizationId, followup, now);
    }
    // Fin du suivi automatisé à la date de contrôle ; les rappels attendent l'accord.
    await scheduleAutomaticEnd(tx, followupId, now);
    await emit(tx, {
      organizationId: actor.organizationId,
      topic: "followup.launched",
      aggregateType: "followup",
      aggregateId: followupId,
    });
    await audit(tx, actor, "followup.launched", followupId, {
      protocolVersionId: followup.protocolVersionId,
      firstContactHours: firstContactHours(
        followup.procedureAt,
        followup.firstContactAt,
      ),
      steps: steps.length,
      alerts: alerts.length,
      test: followup.isTest,
    });
  }

  return {
    /** Recherche dans dr.veto ; signale les animaux qui ont déjà un suivi ouvert. */
    async search(actor: Actor, query: string): Promise<DrVetoSearchHit[]> {
      assertCanPrepare(actor);
      const parsed = searchQuery.safeParse(query);
      if (!parsed.success) return [];
      return run(actor, async (tx) => {
        if (!(await isConnected(tx, "drveto")))
          throw new DomainError("integration_missing");
        const hits = await drveto.searchAnimals(parsed.data);
        if (!hits.length) return [];
        const open = await tx
          .select({ id: followups.id, ref: animals.externalRef })
          .from(followups)
          .innerJoin(animals, eq(animals.id, followups.animalId))
          .where(
            and(
              inArray(
                animals.externalRef,
                hits.map((hit) => hit.ref),
              ),
              ne(followups.status, "ended"),
            ),
          );
        const openByRef = new Map(open.map((row) => [row.ref, row.id]));
        return hits.map((hit) => ({
          ...hit,
          openFollowupId: openByRef.get(hit.ref) ?? null,
        }));
      });
    },

    /**
     * Crée le brouillon depuis dr.veto : animal et propriétaires (rattachés s'ils existent
     * déjà), résumé figé, traitements à valider, protocole proposé et premier message suggéré.
     */
    async prepare(actor: Actor, ref: string): Promise<string> {
      assertCanPrepare(actor);
      if (!drVetoRef.safeParse(ref).success)
        throw new DomainError("invalid_target");
      return run(actor, async (tx) => {
        if (!(await isConnected(tx, "drveto")))
          throw new DomainError("integration_missing");
        const record = await drveto.importRecord(ref);
        if (!record) throw new DomainError("invalid_target");
        const organizationId = actor.organizationId;

        const vets = await activeVets(tx);
        const responsible = VET_ROLES.has(actor.role)
          ? actor.membershipId
          : vets[0]?.membershipId;
        if (!responsible) throw new DomainError("invalid_target");

        const [known] = await tx
          .select({ id: animals.id })
          .from(animals)
          .where(eq(animals.externalRef, record.ref));
        let animalId = known?.id;
        if (animalId) {
          const [open] = await tx
            .select({ id: followups.id })
            .from(followups)
            .where(
              and(
                eq(followups.animalId, animalId),
                ne(followups.status, "ended"),
              ),
            );
          if (open) throw new DomainError("already_followed");
          await tx
            .update(animals)
            .set({
              name: record.animal.name,
              breed: record.animal.breed,
              birthDate: record.animal.birthDate,
              weightGrams: record.animal.weightGrams,
            })
            .where(eq(animals.id, animalId));
        } else {
          const [created] = await tx
            .insert(animals)
            .values({
              organizationId,
              name: record.animal.name,
              species: record.animal.species,
              breed: record.animal.breed,
              birthDate: record.animal.birthDate,
              weightGrams: record.animal.weightGrams,
              externalRef: record.ref,
            })
            .returning({ id: animals.id });
          if (!created) throw new Error("Animal non créé");
          animalId = created.id;
        }

        const choices = (await protocolChoices(tx, actor)).filter((choice) =>
          fitsSpecies(choice, record.animal.species),
        );
        const versionId = suggestProtocol(
          record.procedure.label,
          record.animal.species,
          choices,
        );
        const followupId = randomUUID();
        await tx.insert(followups).values({
          id: followupId,
          organizationId,
          animalId,
          responsibleMembershipId: responsible,
          procedure: record.procedure.label.slice(0, 160),
          procedureAt: record.procedure.at,
          controlAppointmentAt: record.controlAppointmentAt,
          firstContactAt: firstContactAt(
            record.procedure.at,
            FIRST_CONTACT_SUGGESTION_HOURS,
          ),
          status: "draft",
          protocolVersionId: versionId,
          planRevision: versionId ? 1 : 0,
        });
        await tx.insert(followupImports).values({
          followupId,
          organizationId,
          source: "drveto_simulated",
          externalRef: record.ref,
          allergies: record.allergies,
          antecedents: record.antecedents,
          importedByMembershipId: actor.membershipId,
        });
        for (const [index, owner] of record.owners.slice(0, 2).entries()) {
          const ids = await upsertOwner(tx, organizationId, animalId, owner);
          await tx.insert(followupContacts).values({
            organizationId,
            followupId,
            ownerId: ids.ownerId,
            ownerContactId: ids.ownerContactId,
            role: index === 0 ? "primary" : "secondary",
            // Le second contact n'écrit que si le vétérinaire l'active (lot 18).
            active: index === 0,
            language: owner.language,
          });
        }
        const treatments = record.treatments.slice(0, MAX_TREATMENTS);
        if (treatments.length)
          await tx.insert(followupTreatments).values(
            treatments.map((treatment) => ({
              organizationId,
              followupId,
              source: "drveto" as const,
              name: treatment.name.slice(0, 120),
              instructions: treatment.instructions.slice(0, 300),
            })),
          );
        if (versionId)
          await copyProtocolPlan(
            tx,
            organizationId,
            followupId,
            versionId,
            1,
            new Date(),
          );
        await audit(tx, actor, "followup.prepared", followupId, {
          source: "drveto_simulated",
          treatments: treatments.length,
          protocolSuggested: versionId !== null,
        });
        return followupId;
      });
    },

    /** Fiche de lancement (ou de modification d'un suivi lancé). */
    async sheet(actor: Actor, followupId: string): Promise<LaunchSheet> {
      assertCanPrepare(actor);
      return run(actor, async (tx) => {
        const followup = await loadFollowup(tx, actor, followupId);
        if (!canPrepareFollowup(actor, followup.access))
          throw new DomainError("forbidden");
        const draft = followup.status === "draft";
        const canSteer = canSteerFollowup(actor, followup.access);
        const now = new Date();

        const [responsible] = await tx
          .select({ name: users.displayName })
          .from(memberships)
          .innerJoin(users, eq(users.id, memberships.userId))
          .where(eq(memberships.id, followup.responsibleMembershipId));
        const [imported] = await tx
          .select()
          .from(followupImports)
          .where(eq(followupImports.followupId, followupId));
        const contacts = await tx
          .select({
            name: owners.fullName,
            role: followupContacts.role,
            active: followupContacts.active,
            phone: ownerContacts.value,
            language: followupContacts.language,
            optinAt: followupContacts.whatsappOptinAt,
          })
          .from(followupContacts)
          .innerJoin(owners, eq(owners.id, followupContacts.ownerId))
          .innerJoin(
            ownerContacts,
            eq(ownerContacts.id, followupContacts.ownerContactId),
          )
          .where(eq(followupContacts.followupId, followupId))
          .orderBy(asc(followupContacts.role));
        const treatments = await tx
          .select({
            id: followupTreatments.id,
            source: followupTreatments.source,
            name: followupTreatments.name,
            instructions: followupTreatments.instructions,
            validatedBy: users.displayName,
            validatedAt: followupTreatments.validatedAt,
          })
          .from(followupTreatments)
          .leftJoin(
            memberships,
            eq(memberships.id, followupTreatments.validatedByMembershipId),
          )
          .leftJoin(users, eq(users.id, memberships.userId))
          .where(
            and(
              eq(followupTreatments.followupId, followupId),
              isNull(followupTreatments.removedAt),
            ),
          )
          .orderBy(asc(followupTreatments.createdAt));

        const [version] = followup.protocolVersionId
          ? await tx
              .select({
                protocolId: protocolVersions.protocolId,
                versionId: protocolVersions.id,
                name: protocolVersions.name,
                versionNumber: protocolVersions.versionNumber,
              })
              .from(protocolVersions)
              .where(eq(protocolVersions.id, followup.protocolVersionId))
          : [];

        // Brouillon sans révision (suivi test) : la version choisie sert de proposition.
        let steps: SheetStep[];
        let alerts: LaunchSheet["alerts"];
        if (followup.planRevision === 0 && followup.protocolVersionId) {
          const versionSteps = await tx
            .select()
            .from(protocolSteps)
            .where(
              eq(protocolSteps.protocolVersionId, followup.protocolVersionId),
            )
            .orderBy(asc(protocolSteps.position));
          steps = versionSteps.map((step) => ({
            offsetHours: step.offsetHours,
            kind: step.kind,
            content: step.content,
            dueAt: stepDueAt(followup.procedureAt, step.offsetHours),
            locked: false,
          }));
          alerts = (
            await tx
              .select()
              .from(alertRules)
              .where(
                eq(alertRules.protocolVersionId, followup.protocolVersionId),
              )
              .orderBy(asc(alertRules.position))
          ).map((rule) => ({
            level: rule.level,
            description: rule.description,
          }));
        } else {
          steps = (await currentSteps(tx, followupId)).map((step) => ({
            offsetHours: step.offsetHours,
            kind: step.kind,
            content: step.content,
            dueAt: stepDueAt(followup.procedureAt, step.offsetHours),
            locked:
              !draft && isPastStep(followup.procedureAt, step.offsetHours, now),
          }));
          alerts = (await currentAlerts(tx, followupId)).map((rule) => ({
            level: rule.level,
            description: rule.description,
          }));
        }

        const protocolOptions = draft
          ? (await protocolChoices(tx, actor))
              .filter((choice) => fitsSpecies(choice, followup.species))
              .map((choice) => ({
                protocolId: choice.protocolId,
                name: choice.name,
                versionNumber: choice.versionNumber,
              }))
          : [];

        return {
          followup: {
            id: followup.id,
            status: followup.status,
            isTest: followup.isTest,
            animalName: followup.animalName,
            species: followup.species,
            breed: followup.breed,
            procedure: followup.procedure,
            procedureAt: followup.procedureAt,
            controlAppointmentAt: followup.controlAppointmentAt,
            firstContactAt: followup.firstContactAt,
            firstContactHours: followup.firstContactAt
              ? firstContactHours(followup.procedureAt, followup.firstContactAt)
              : FIRST_CONTACT_SUGGESTION_HOURS,
            startedAt: followup.startedAt,
            responsibleMembershipId: followup.responsibleMembershipId,
            responsibleName: responsible?.name ?? "—",
            planRevision: followup.planRevision,
          },
          imported: imported
            ? {
                externalRef: imported.externalRef,
                importedAt: imported.importedAt,
                allergies: imported.allergies,
                antecedents: imported.antecedents,
              }
            : null,
          contacts: contacts.map((contact) => ({
            name: contact.name,
            role: contact.role,
            active: contact.active,
            phone: maskPhone(contact.phone),
            language: contact.language,
            optedIn: contact.optinAt !== null,
          })),
          treatments: treatments.map((treatment) => ({
            ...treatment,
            validatedBy: treatment.validatedAt ? treatment.validatedBy : null,
          })),
          protocol: version ?? null,
          steps,
          alerts,
          protocolOptions,
          vetOptions: draft ? await activeVets(tx) : [],
          generatedAt: now,
          rights: {
            canEdit: draft ? true : canSteer && followup.status !== "ended",
            canSteer,
            canLaunch:
              draft &&
              canLaunchFollowup(
                actor,
                followup.access,
                followup.responsibleMembershipId,
              ),
          },
        };
      });
    },

    /** Brouillon : choisit le protocole ; étapes et signes d'alerte repartent de sa version. */
    async applyProtocol(actor: Actor, followupId: string, protocolId: string) {
      assertCanPrepare(actor);
      if (!uuid.safeParse(protocolId).success)
        throw new DomainError("invalid_target");
      await run(actor, async (tx) => {
        const followup = await loadFollowup(tx, actor, followupId, true);
        if (!canPrepareFollowup(actor, followup.access))
          throw new DomainError("forbidden");
        if (followup.status !== "draft")
          throw new DomainError("invalid_transition");
        const choice = (await protocolChoices(tx, actor)).find(
          (candidate) => candidate.protocolId === protocolId,
        );
        if (!choice || !fitsSpecies(choice, followup.species))
          throw new DomainError("invalid_target");
        const revision = followup.planRevision + 1;
        const copied = await copyProtocolPlan(
          tx,
          actor.organizationId,
          followupId,
          choice.versionId,
          revision,
          new Date(),
        );
        await tx
          .update(followups)
          .set({ protocolVersionId: choice.versionId, planRevision: revision })
          .where(eq(followups.id, followupId));
        await audit(tx, actor, "followup.protocol_chosen", followupId, {
          protocolVersionId: choice.versionId,
          revision,
          ...copied,
        });
      });
    },

    /**
     * Enregistre la fiche ; avec `launch`, lance le suivi dans la même transaction. Sur un
     * suivi lancé, seules les étapes à venir sont remplacées ; les passées restent telles quelles.
     */
    async save(
      actor: Actor,
      followupId: string,
      input: unknown,
      options: { launch: boolean },
      now = new Date(),
    ) {
      assertCanPrepare(actor);
      const parsed = sheetInput.safeParse(input);
      if (!parsed.success) throw new DomainError("invalid_target");
      const data = parsed.data;
      await run(actor, async (tx) => {
        const followup = await loadFollowup(tx, actor, followupId, true);
        if (!canPrepareFollowup(actor, followup.access))
          throw new DomainError("forbidden");
        if (followup.status === "ended")
          throw new DomainError("invalid_transition");
        const draft = followup.status === "draft";
        const canSteer = canSteerFollowup(actor, followup.access);
        if (!draft && !canSteer) throw new DomainError("forbidden");
        if (!followup.protocolVersionId)
          throw new DomainError("launch_incomplete");

        // Responsable et premier message : seulement avant le lancement.
        const changes: Partial<typeof followups.$inferInsert> = {
          controlAppointmentAt: data.controlAppointmentAt,
        };
        if (
          data.controlAppointmentAt &&
          data.controlAppointmentAt.getTime() <= followup.procedureAt.getTime()
        )
          throw new DomainError("invalid_target");
        if (draft) {
          if (
            data.responsibleMembershipId &&
            data.responsibleMembershipId !== followup.responsibleMembershipId
          ) {
            const vets = await activeVets(tx);
            if (
              !vets.some(
                (vet) => vet.membershipId === data.responsibleMembershipId,
              )
            )
              throw new DomainError("invalid_target");
            changes.responsibleMembershipId = data.responsibleMembershipId;
          }
          if (data.firstContactHours !== undefined)
            changes.firstContactAt = firstContactAt(
              followup.procedureAt,
              data.firstContactHours,
            );
          if (data.secondContactActive !== undefined) {
            const updated = await tx
              .update(followupContacts)
              .set({ active: data.secondContactActive })
              .where(
                and(
                  eq(followupContacts.followupId, followupId),
                  eq(followupContacts.role, "secondary"),
                ),
              )
              .returning({ id: followupContacts.id });
            if (data.secondContactActive && !updated.length)
              throw new DomainError("invalid_target");
          }
          if (data.whatsappOptIn !== undefined)
            await tx
              .update(followupContacts)
              .set(
                data.whatsappOptIn
                  ? {
                      whatsappOptinAt: now,
                      whatsappOptinByMembershipId: actor.membershipId,
                    }
                  : {
                      whatsappOptinAt: null,
                      whatsappOptinByMembershipId: null,
                    },
              )
              .where(
                and(
                  eq(followupContacts.followupId, followupId),
                  // Accord déjà noté : sa date et son auteur restent ceux d'origine.
                  data.whatsappOptIn
                    ? isNull(followupContacts.whatsappOptinAt)
                    : sql`true`,
                ),
              );
          if (data.whatsappOptIn !== undefined)
            await audit(tx, actor, "followup.whatsapp_optin", followupId, {
              given: data.whatsappOptIn,
            });
        }

        // Traitements : décisions de vétérinaire.
        const touchesTreatments =
          data.validateTreatmentIds.length +
          data.removeTreatmentIds.length +
          data.addTreatments.length;
        if (touchesTreatments && !canSteer) throw new DomainError("forbidden");
        const treatments = await tx
          .select({
            id: followupTreatments.id,
            source: followupTreatments.source,
            validatedAt: followupTreatments.validatedAt,
          })
          .from(followupTreatments)
          .where(
            and(
              eq(followupTreatments.followupId, followupId),
              isNull(followupTreatments.removedAt),
            ),
          );
        const byId = new Map(treatments.map((row) => [row.id, row]));
        for (const id of data.validateTreatmentIds) {
          const row = byId.get(id);
          if (!row || row.source !== "drveto" || row.validatedAt)
            throw new DomainError("invalid_target");
        }
        for (const id of data.removeTreatmentIds)
          if (!byId.has(id)) throw new DomainError("invalid_target");
        if (
          treatments.length -
            data.removeTreatmentIds.length +
            data.addTreatments.length >
          MAX_TREATMENTS
        )
          throw new DomainError("invalid_target");
        const toValidate = data.validateTreatmentIds.filter(
          (id) => !data.removeTreatmentIds.includes(id),
        );
        if (toValidate.length)
          await tx
            .update(followupTreatments)
            .set({
              validatedByMembershipId: actor.membershipId,
              validatedAt: now,
            })
            .where(inArray(followupTreatments.id, toValidate));
        if (data.removeTreatmentIds.length)
          await tx
            .update(followupTreatments)
            .set({ removedAt: now })
            .where(inArray(followupTreatments.id, data.removeTreatmentIds));
        if (data.addTreatments.length)
          await tx.insert(followupTreatments).values(
            data.addTreatments.map((treatment) => ({
              organizationId: actor.organizationId,
              followupId,
              source: "vet" as const,
              name: treatment.name,
              instructions: treatment.instructions,
              validatedByMembershipId: actor.membershipId,
              validatedAt: now,
            })),
          );

        // Étapes : un suivi lancé garde ses étapes passées, qui ont pu partir.
        const current = await currentSteps(tx, followupId);
        const kept = draft
          ? []
          : current.filter((step) =>
              isPastStep(followup.procedureAt, step.offsetHours, now),
            );
        if (
          !draft &&
          data.steps.some((step) =>
            isPastStep(followup.procedureAt, step.offsetHours, now),
          )
        )
          throw new DomainError("past_step");
        if (kept.length + data.steps.length > MAX_STEPS)
          throw new DomainError("invalid_target");
        const keptIds = new Set(kept.map((step) => step.id));
        const replaced = current
          .filter((step) => !keptIds.has(step.id))
          .map((step) => step.id);
        if (replaced.length)
          await tx
            .update(followupSteps)
            .set({ supersededAt: now })
            .where(inArray(followupSteps.id, replaced));
        const revision = followup.planRevision + 1;
        const start = Math.max(0, ...kept.map((step) => step.position));
        const ordered = data.steps
          .map((step, index) => ({ step, index }))
          .sort(
            (a, b) =>
              a.step.offsetHours - b.step.offsetHours || a.index - b.index,
          );
        if (ordered.length)
          await tx.insert(followupSteps).values(
            ordered.map(({ step }, index) => ({
              organizationId: actor.organizationId,
              followupId,
              revision,
              position: start + index + 1,
              offsetHours: step.offsetHours,
              kind: step.kind,
              content: step.content,
            })),
          );
        await tx
          .update(followupAlertRules)
          .set({ supersededAt: now })
          .where(
            and(
              eq(followupAlertRules.followupId, followupId),
              isNull(followupAlertRules.supersededAt),
            ),
          );
        await tx.insert(followupAlertRules).values(
          data.alerts.map((alert, index) => ({
            organizationId: actor.organizationId,
            followupId,
            revision,
            position: index + 1,
            level: alert.level,
            description: alert.description,
          })),
        );

        await tx
          .update(followups)
          .set({ ...changes, planRevision: revision })
          .where(eq(followups.id, followupId));
        if (!draft) {
          // Les rappels à venir suivent la nouvelle fiche ; ceux déjà partis ne changent pas.
          await scheduleReminders(tx, followupId, now);
          await scheduleAutomaticEnd(tx, followupId, now);
        }
        await audit(tx, actor, "followup.plan_updated", followupId, {
          revision,
          status: followup.status,
          steps: kept.length + data.steps.length,
          alerts: data.alerts.length,
          treatmentsAdded: data.addTreatments.length,
          treatmentsRemoved: data.removeTreatmentIds.length,
        });
        if (toValidate.length)
          await audit(tx, actor, "followup.treatments_validated", followupId, {
            count: toValidate.length,
          });
        if (options.launch) await launchInTx(tx, actor, followupId, now);
      });
    },

    /** Programme du suivi lancé (étapes et fin automatique), réservé à l'accès clinique. */
    async programme(actor: Actor, followupId: string): Promise<ProgrammeView> {
      assertPermission(actor, "clinical.read");
      return run(actor, async (tx) => {
        const followup = await loadFollowup(tx, actor, followupId);
        if (followup.access !== "clinical" || followup.status === "draft")
          throw new DomainError("not_found");
        return programmeOf(tx, followupId);
      });
    },

    /** Pause, reprise, arrêt ou réactivation : décision d'un vétérinaire, journalisée. */
    async changeStatus(
      actor: Actor,
      followupId: string,
      change: StatusChange,
      now = new Date(),
    ) {
      assertCanPrepare(actor);
      const transition = TRANSITIONS[change];
      await run(actor, async (tx) => {
        const followup = await loadFollowup(tx, actor, followupId, true);
        if (!canSteerFollowup(actor, followup.access))
          throw new DomainError("forbidden");
        if (!transition.from.includes(followup.status))
          throw new DomainError("invalid_transition");

        await setStatusReason(tx, transition.reason);
        await tx
          .update(followups)
          .set({
            status: transition.to,
            endedAt: transition.to === "ended" ? now : null,
          })
          .where(eq(followups.id, followupId));
        if (change === "stop")
          // Plus rien ne part : les envois et rappels à venir sont abandonnés.
          await tx
            .update(scheduledJobs)
            .set({ status: "cancelled", finishedAt: now })
            .where(
              and(
                eq(scheduledJobs.followupId, followupId),
                eq(scheduledJobs.status, "pending"),
              ),
            );
        // Premier message jamais parti (pause ou arrêt avant l'heure) : il est replanifié.
        if (transition.to === "active" && !followup.isTest)
          await scheduleIntro(
            tx,
            actor.organizationId,
            followup,
            now,
            randomUUID(),
          );
        // Rappels à venir et fin du suivi automatisé : ceux passés entre-temps ne partent pas.
        if (transition.to === "active") {
          await scheduleReminders(tx, followupId, now);
          await scheduleAutomaticEnd(tx, followupId, now);
        }
        if (change === "reactivate" && !followup.isTest)
          await recordUsage(
            tx,
            actor.organizationId,
            {
              followupId,
              kind: "reactivation",
              idempotencyKey: `reactivation:${followupId}:${randomUUID()}`,
            },
            now,
          );
        await audit(tx, actor, transition.action, followupId, {
          from: followup.status,
        });
      });
    },
  };
}

export type LaunchService = ReturnType<typeof launchService>;
