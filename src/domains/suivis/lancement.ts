import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";

import type { DrVetoConnector } from "@/adapters/drveto/types";
import { foldText } from "@/domains/commun/utilitaires";
import { DomainError, assertPermission } from "@/domains/commun/actor";
import type { Actor } from "@/domains/commun/actor";
import { VET_ROLES } from "@/domains/equipe/permissions";
import { activeVets } from "@/domains/equipe/veterinaires";
import { recordUsage } from "@/domains/facturation/service";
import { MAX_STEPS } from "@/domains/protocoles/content";
import { emit } from "@/domains/taches/queue";
import { maskPhone } from "@/domains/whatsapp/numero";
import { currentContacts } from "@/domains/patients/service";
import { manualFollowupInput } from "@/domains/patients/content";
import type { ManualFollowupInput } from "@/domains/patients/content";
import {
  alertRules,
  animalOwners,
  animals,
  followupAlertRules,
  followupContacts,
  followupImports,
  followupSteps,
  followupTreatments,
  followups,
  memberships,
  ownerContacts,
  owners,
  protocolSteps,
  protocolVersions,
  scheduledJobs,
  users,
} from "@/server/db/schema";
import { tenantRunner } from "@/server/db/tenant";
import type { Database, TenantTransaction } from "@/server/db/tenant";
import { auditFollowup } from "@/domains/audit/journal";

import {
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
import type { SheetInput } from "./plan";
import {
  canLaunchFollowup,
  canPrepareFollowup,
  canSteerFollowup,
} from "./policies";
import type {
  DrVetoSearchHit,
  LaunchSheet,
  LoadedFollowup,
  SheetStep,
  StatusChange,
} from "./chargement";
import {
  copyProtocolPlan,
  currentAlerts,
  currentSteps,
  drVetoRef,
  isConnected,
  loadFollowup,
  protocolChoices,
  scheduleIntro,
  searchQuery,
  setStatusReason,
  TRANSITIONS,
  upsertOwner,
  uuid,
} from "./chargement";

export {
  setStatusReason,
  loadFollowup,
  copyProtocolPlan,
  reminderTreatments,
  TRANSITIONS,
} from "./chargement";
export type {
  StatusChange,
  DrVetoSearchHit,
  SheetStep,
  SheetTreatment,
  LaunchSheet,
  LoadedFollowup,
} from "./chargement";

/** Une fiche en cours d'enregistrement, dans la transaction de `save`. */
type SheetSave = {
  tx: TenantTransaction;
  actor: Actor;
  followupId: string;
  followup: LoadedFollowup;
  data: SheetInput;
  now: Date;
};

/**
 * En-tête de la fiche : contrôle, puis, avant le lancement seulement, responsable, premier
 * message, second propriétaire et accord WhatsApp. Renvoie les changements du suivi.
 */
async function applySheetHeader(
  { tx, actor, followupId, followup, data, now }: SheetSave,
  launch: boolean,
): Promise<Partial<typeof followups.$inferInsert>> {
  const changes: Partial<typeof followups.$inferInsert> = {
    controlAppointmentAt: data.controlAppointmentAt,
  };
  if (
    data.controlAppointmentAt &&
    data.controlAppointmentAt.getTime() <= followup.procedureAt.getTime()
  )
    throw new DomainError("invalid_target");
  // Responsable et premier message : seulement avant le lancement.
  if (followup.status === "draft") {
    if (
      data.responsibleMembershipId &&
      data.responsibleMembershipId !== followup.responsibleMembershipId
    ) {
      // Changer de responsable et lancer sont deux décisions distinctes (ADR 0015 §6).
      // Un vétérinaire ne reprend pas le brouillon d'un confrère : seuls l'équipe qui
      // prépare, le responsable actuel et un administrateur de l'équipe le réattribuent.
      if (launch) throw new DomainError("invalid_transition");
      if (
        actor.role !== "assistant" &&
        actor.membershipId !== followup.responsibleMembershipId &&
        !actor.permissions.has("team.manage")
      )
        throw new DomainError("forbidden");
      const vets = await activeVets(tx);
      if (
        !vets.some((vet) => vet.membershipId === data.responsibleMembershipId)
      )
        throw new DomainError("invalid_target");
      changes.responsibleMembershipId = data.responsibleMembershipId;
      await auditFollowup(tx, actor, "followup.reassigned", followupId, {
        from: followup.responsibleMembershipId,
        to: data.responsibleMembershipId,
      });
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
            // Accord donné : pour les contacts qui écriront seulement (le second n'en fait
            // partie que s'il est inclus). Déjà noté : sa date et son auteur restent.
            data.whatsappOptIn
              ? and(
                  eq(followupContacts.active, true),
                  isNull(followupContacts.whatsappOptinAt),
                )
              : sql`true`,
          ),
        );
    if (data.whatsappOptIn !== undefined)
      await auditFollowup(tx, actor, "followup.whatsapp_optin", followupId, {
        given: data.whatsappOptIn,
      });
  }
  return changes;
}

/** Traitements : décisions de vétérinaire. Renvoie les traitements validés. */
async function applyTreatmentDecisions(
  { tx, actor, followupId, data, now }: SheetSave,
  canSteer: boolean,
): Promise<string[]> {
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
  return toValidate;
}

/**
 * Étapes à venir et signes d'alerte remplacés par ceux de la fiche, sous la révision
 * `revision`. Renvoie le nombre d'étapes du programme.
 */
async function replaceFutureSteps(
  { tx, actor, followupId, followup, data, now }: SheetSave,
  draft: boolean,
  revision: number,
): Promise<number> {
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
  const start = Math.max(0, ...kept.map((step) => step.position));
  const ordered = data.steps
    .map((step, index) => ({ step, index }))
    .sort(
      (a, b) => a.step.offsetHours - b.step.offsetHours || a.index - b.index,
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
  return kept.length + data.steps.length;
}

/**
 * Vétérinaire actif du cabinet qui a opéré, d'après le nom donné par dr.veto (ADR 0047) :
 * seulement si un seul vétérinaire porte ce nom, accents et majuscules mis à part.
 */
function practitionerOf(
  vets: { membershipId: string; name: string }[],
  practitionerName: string | null,
): string | null {
  if (!practitionerName) return null;
  const wanted = foldText(practitionerName).trim();
  const matches = vets.filter((vet) => foldText(vet.name).trim() === wanted);
  return matches.length === 1 ? (matches[0]?.membershipId ?? null) : null;
}

/** Un brouillon est créé non privé : qui voit la liste du cabinet garde l'accès à celui d'un confrère. */
function seesColleagueDrafts(actor: Actor): boolean {
  return (
    actor.permissions.has("followups.read_all") ||
    actor.permissions.has("followups.read_summary")
  );
}

/** Traitements importés de dr.veto que le vétérinaire n'a pas encore validés. */
function pendingImports(tx: TenantTransaction, followupId: string) {
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
        eq(followupTreatments.source, "drveto"),
        isNull(followupTreatments.validatedAt),
        isNull(followupTreatments.removedAt),
      ),
    )
    .orderBy(asc(followupTreatments.createdAt));
}

/** Ce qui empêche encore un brouillon d'être lancé, dans l'ordre où la fiche le demande. */
export type LaunchBlocker =
  "launch_incomplete" | "integration_missing" | "optin_missing";

/**
 * Brouillon prêt à lancer ? Protocole validé, premier message daté, étapes et signes d'alerte,
 * WhatsApp relié et accord de chaque contact actif (un suivi test n'envoie rien). Renvoie le
 * premier manque, et les nombres d'étapes et de signes d'alerte pour le journal.
 */
async function launchReadiness(
  tx: TenantTransaction,
  followup: LoadedFollowup,
  whatsappReady: boolean,
): Promise<{ blocker: LaunchBlocker | null; steps: number; alerts: number }> {
  const steps = (await currentSteps(tx, followup.id)).length;
  const alerts = (await currentAlerts(tx, followup.id)).length;
  const [version] = followup.protocolVersionId
    ? await tx
        .select({ validatedAt: protocolVersions.validatedAt })
        .from(protocolVersions)
        .where(eq(protocolVersions.id, followup.protocolVersionId))
    : [];
  if (!version?.validatedAt || !followup.firstContactAt || !steps || !alerts)
    return { blocker: "launch_incomplete", steps, alerts };
  if (!whatsappReady) return { blocker: "integration_missing", steps, alerts };
  // Pas de premier message sans l'accord pour WhatsApp, recueilli au cabinet.
  if (!followup.isTest) {
    const [missing] = await tx
      .select({ id: followupContacts.id })
      .from(followupContacts)
      .where(
        and(
          eq(followupContacts.followupId, followup.id),
          eq(followupContacts.active, true),
          isNull(followupContacts.whatsappOptinAt),
        ),
      )
      .limit(1);
    if (missing) return { blocker: "optin_missing", steps, alerts };
  }
  return { blocker: null, steps, alerts };
}

/** Brouillons montrés dans « Prêts à lancer », au plus. */
export const MAX_READY_DRAFTS = 30;

/**
 * Brouillon de la file « Prêts à lancer » (ADR 0046) : ce que le vétérinaire relit avant de
 * lancer en un clic, dont les traitements importés qu'il valide du même geste.
 */
export type ReadyDraft = {
  id: string;
  animalName: string;
  species: "dog" | "cat";
  procedure: string;
  procedureAt: Date;
  protocolName: string | null;
  firstContactAt: Date | null;
  controlAppointmentAt: Date | null;
  responsibleName: string;
  /** L'acteur est le vétérinaire responsable et peut lancer. */
  canLaunch: boolean;
  blocker: LaunchBlocker | null;
  /** Traitements importés de dr.veto, pas encore validés. */
  treatments: { id: string; name: string; instructions: string }[];
};

/** Opérés du jour montrés sur la vue d'ensemble, au plus. */
export const MAX_OPERATIONS = 20;

/**
 * Animal opéré dans la journée, lu dans dr.veto (ADR 0047), avec l'état de son suivi dans
 * Stivea : rien encore, brouillon préparé ou suivi en cours.
 */
export type OperatedAnimal = {
  ref: string;
  name: string;
  species: "dog" | "cat";
  procedure: string;
  at: Date;
  practitionerName: string | null;
  followup: {
    id: string;
    status: "draft" | "active" | "paused" | "human_takeover";
  } | null;
};

/** Préparation de plusieurs fiches depuis « Opérés du jour ». */
export const prepareManyInput = z
  .array(z.string().regex(/^[A-Za-z0-9-]{3,64}$/))
  .min(1)
  .max(MAX_OPERATIONS);

/** Lancement depuis la file : chaque suivi avec les traitements que le vétérinaire a relus. */
export const queueLaunchInput = z
  .array(
    z.object({
      followupId: z.uuid(),
      treatmentIds: z.array(z.uuid()).max(MAX_TREATMENTS),
    }),
  )
  .min(1)
  .max(MAX_READY_DRAFTS);

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
    via: "sheet" | "queue" = "sheet",
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
    const { blocker, steps, alerts } = await launchReadiness(
      tx,
      followup,
      followup.isTest || (await isConnected(tx, "whatsapp")),
    );
    if (blocker) throw new DomainError(blocker);
    if (!followup.protocolVersionId || !followup.firstContactAt)
      throw new DomainError("launch_incomplete");

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
    await auditFollowup(tx, actor, "followup.launched", followupId, {
      protocolVersionId: followup.protocolVersionId,
      firstContactHours: firstContactHours(
        followup.procedureAt,
        followup.firstContactAt,
      ),
      steps,
      alerts,
      test: followup.isTest,
      ...(via === "queue" ? { via } : {}),
    });
  }

  /**
   * Brouillon commun aux deux entrées (dr.veto, registre du cabinet) : premier message
   * suggéré, contacts (le second n'écrit que si le vétérinaire l'active, lot 18) et plan du
   * protocole proposé.
   */
  async function insertDraft(
    tx: TenantTransaction,
    actor: Actor,
    draft: {
      animalId: string;
      responsible: string;
      procedure: string;
      procedureAt: Date;
      controlAppointmentAt: Date | null;
      versionId: string | null;
      contacts: {
        ownerId: string;
        ownerContactId: string;
        language: "fr" | "en";
      }[];
    },
  ): Promise<string> {
    const organizationId = actor.organizationId;
    const followupId = randomUUID();
    await tx.insert(followups).values({
      id: followupId,
      organizationId,
      animalId: draft.animalId,
      responsibleMembershipId: draft.responsible,
      procedure: draft.procedure.slice(0, 160),
      procedureAt: draft.procedureAt,
      controlAppointmentAt: draft.controlAppointmentAt,
      firstContactAt: firstContactAt(
        draft.procedureAt,
        FIRST_CONTACT_SUGGESTION_HOURS,
      ),
      status: "draft",
      protocolVersionId: draft.versionId,
      planRevision: draft.versionId ? 1 : 0,
    });
    for (const [index, contact] of draft.contacts.slice(0, 2).entries())
      await tx.insert(followupContacts).values({
        organizationId,
        followupId,
        ownerId: contact.ownerId,
        ownerContactId: contact.ownerContactId,
        role: index === 0 ? "primary" : "secondary",
        active: index === 0,
        language: contact.language,
      });
    if (draft.versionId)
      await copyProtocolPlan(
        tx,
        organizationId,
        followupId,
        draft.versionId,
        1,
        new Date(),
      );
    return followupId;
  }

  /**
   * Vétérinaire responsable proposé : celui qui a opéré, si dr.veto le nomme et qu'un seul
   * vétérinaire actif du cabinet porte ce nom (ADR 0047) ; sinon l'acteur s'il est
   * vétérinaire, sinon le premier actif.
   */
  async function defaultResponsible(
    tx: TenantTransaction,
    actor: Actor,
    practitionerName: string | null = null,
  ) {
    const vets = await activeVets(tx);
    const surgeon = practitionerOf(vets, practitionerName);
    // Qui ne voit que ses suivis perdrait l'accès à la fiche d'un confrère : il en reste
    // responsable et peut la réattribuer depuis la fiche.
    if (
      surgeon &&
      (surgeon === actor.membershipId || seesColleagueDrafts(actor))
    )
      return surgeon;
    if (VET_ROLES.has(actor.role)) return actor.membershipId;
    const [first] = vets;
    if (!first) throw new DomainError("invalid_target");
    return first.membershipId;
  }

  /** Brouillon depuis dr.veto, dans la transaction de l'appelant. */
  async function prepareIn(
    tx: TenantTransaction,
    actor: Actor,
    ref: string,
  ): Promise<string> {
    if (!(await isConnected(tx, "drveto")))
      throw new DomainError("integration_missing");
    const record = await drveto.importRecord(ref);
    if (!record) throw new DomainError("invalid_target");
    const organizationId = actor.organizationId;

    const responsible = await defaultResponsible(
      tx,
      actor,
      record.procedure.practitionerName,
    );

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
          and(eq(followups.animalId, animalId), ne(followups.status, "ended")),
        );
      if (open) throw new DomainError("already_followed");
      await tx
        .update(animals)
        .set({
          name: record.animal.name,
          breed: record.animal.breed,
          birthDate: record.animal.birthDate,
          weightGrams: record.animal.weightGrams,
          archivedAt: null,
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
    const contacts = [];
    for (const owner of record.owners.slice(0, 2))
      contacts.push({
        ...(await upsertOwner(tx, organizationId, animalId, owner)),
        language: owner.language,
      });
    const followupId = await insertDraft(tx, actor, {
      animalId,
      responsible,
      procedure: record.procedure.label,
      procedureAt: record.procedure.at,
      controlAppointmentAt: record.controlAppointmentAt,
      versionId,
      contacts,
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
    await auditFollowup(tx, actor, "followup.prepared", followupId, {
      source: "drveto_simulated",
      treatments: treatments.length,
      protocolSuggested: versionId !== null,
    });
    return followupId;
  }

  /** Programme d'un suivi déjà chargé, dans la transaction de l'appelant (ADR 0040). */
  async function programmeIn(
    tx: TenantTransaction,
    actor: Actor,
    followup: LoadedFollowup,
  ): Promise<ProgrammeView> {
    assertPermission(actor, "clinical.read");
    if (followup.access !== "clinical" || followup.status === "draft")
      throw new DomainError("not_found");
    return programmeOf(tx, followup.id);
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
      return run(actor, (tx) => prepareIn(tx, actor, ref));
    },

    /**
     * « Opérés du jour » (ADR 0047) : animaux opérés aujourd'hui selon dr.veto, avec l'état de
     * leur suivi. Null si dr.veto n'est pas relié au cabinet.
     */
    async operatedToday(
      actor: Actor,
      now = new Date(),
    ): Promise<OperatedAnimal[] | null> {
      assertCanPrepare(actor);
      return run(actor, async (tx) => {
        if (!(await isConnected(tx, "drveto"))) return null;
        const vets = await activeVets(tx);
        // Qui ne voit que ses suivis : ses opérés, et ceux d'un praticien hors de l'équipe.
        const operations = (await drveto.operationsOfDay(now))
          .filter((operation) => {
            if (seesColleagueDrafts(actor)) return true;
            const surgeon = practitionerOf(vets, operation.practitionerName);
            return !surgeon || surgeon === actor.membershipId;
          })
          .slice(0, MAX_OPERATIONS);
        if (!operations.length) return [];
        const open = await tx
          .select({
            id: followups.id,
            status: followups.status,
            ref: animals.externalRef,
          })
          .from(followups)
          .innerJoin(animals, eq(animals.id, followups.animalId))
          .where(
            and(
              inArray(
                animals.externalRef,
                operations.map((operation) => operation.ref),
              ),
              ne(followups.status, "ended"),
              eq(followups.isTest, false),
            ),
          );
        const byRef = new Map(open.map((row) => [row.ref, row]));
        return operations.map((operation) => {
          const followup = byRef.get(operation.ref);
          return {
            ...operation,
            followup:
              followup && followup.status !== "ended"
                ? { id: followup.id, status: followup.status }
                : null,
          };
        });
      });
    },

    /**
     * « Tout préparer » : une fiche par animal opéré, chacune dans sa transaction. Un animal
     * déjà suivi, ou absent de dr.veto, est passé. Renvoie le nombre de fiches créées.
     */
    async prepareMany(actor: Actor, refs: unknown): Promise<number> {
      assertCanPrepare(actor);
      const parsed = prepareManyInput.safeParse(refs);
      if (!parsed.success) throw new DomainError("invalid_target");
      let prepared = 0;
      for (const ref of new Set(parsed.data))
        try {
          await run(actor, (tx) => prepareIn(tx, actor, ref));
          prepared += 1;
        } catch (error) {
          if (!(error instanceof DomainError)) throw error;
        }
      return prepared;
    },

    /**
     * Accord WhatsApp recueilli à l'accueil, noté depuis « Prêts à lancer » (ADR 0047) : pour
     * les contacts qui écriront, par qui prépare la fiche, journalisé comme depuis la fiche.
     */
    async recordOptIn(actor: Actor, followupId: string, now = new Date()) {
      assertCanPrepare(actor);
      await run(actor, async (tx) => {
        const followup = await loadFollowup(tx, actor, followupId, true);
        if (!canPrepareFollowup(actor, followup.access))
          throw new DomainError("forbidden");
        if (followup.status !== "draft" || followup.isTest)
          throw new DomainError("invalid_transition");
        await tx
          .update(followupContacts)
          .set({
            whatsappOptinAt: now,
            whatsappOptinByMembershipId: actor.membershipId,
          })
          .where(
            and(
              eq(followupContacts.followupId, followupId),
              eq(followupContacts.active, true),
              isNull(followupContacts.whatsappOptinAt),
            ),
          );
        await auditFollowup(tx, actor, "followup.whatsapp_optin", followupId, {
          given: true,
          via: "queue",
        });
      });
    },

    /** Protocoles validés que l'acteur peut appliquer à cette espèce. */
    async protocolOptions(actor: Actor, species: "dog" | "cat") {
      assertCanPrepare(actor);
      return run(actor, async (tx) =>
        (await protocolChoices(tx, actor))
          .filter((choice) => fitsSpecies(choice, species))
          .map((choice) => ({ id: choice.protocolId, name: choice.name })),
      );
    },

    /**
     * Crée le brouillon depuis la fiche d'un animal du registre (sans dr.veto) : intervention
     * saisie, protocole choisi ou proposé, propriétaires de l'animal comme contacts.
     */
    async prepareFromAnimal(
      actor: Actor,
      animalId: string,
      input: ManualFollowupInput,
    ): Promise<string> {
      assertCanPrepare(actor);
      const parsed = manualFollowupInput.safeParse(input);
      if (!uuid.safeParse(animalId).success || !parsed.success)
        throw new DomainError("invalid_target");
      const draft = parsed.data;
      return run(actor, async (tx) => {
        const [animal] = await tx
          .select({
            species: animals.species,
            archivedAt: animals.archivedAt,
          })
          .from(animals)
          .where(eq(animals.id, animalId))
          .for("update");
        if (!animal) throw new DomainError("not_found");
        if (animal.archivedAt) throw new DomainError("invalid_transition");
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

        const choices = (await protocolChoices(tx, actor)).filter((choice) =>
          fitsSpecies(choice, animal.species),
        );
        let versionId: string | null;
        if (draft.protocolId) {
          const chosen = choices.find(
            (choice) => choice.protocolId === draft.protocolId,
          );
          if (!chosen) throw new DomainError("invalid_target");
          versionId = chosen.versionId;
        } else
          versionId = suggestProtocol(draft.procedure, animal.species, choices);

        const ownerRows = await tx
          .select({
            ownerId: animalOwners.ownerId,
            language: owners.preferredLanguage,
          })
          .from(animalOwners)
          .innerJoin(owners, eq(owners.id, animalOwners.ownerId))
          .where(eq(animalOwners.animalId, animalId))
          .orderBy(asc(animalOwners.createdAt));
        const numbers = await currentContacts(
          tx,
          ownerRows.map((row) => row.ownerId),
        );
        const contacts = ownerRows.flatMap((row) => {
          const whatsapp = numbers.get(row.ownerId)?.whatsapp;
          return whatsapp
            ? [
                {
                  ownerId: row.ownerId,
                  ownerContactId: whatsapp.id,
                  language: row.language,
                },
              ]
            : [];
        });
        if (!contacts.length) throw new DomainError("invalid_target");

        const followupId = await insertDraft(tx, actor, {
          animalId,
          responsible: await defaultResponsible(tx, actor),
          procedure: draft.procedure,
          procedureAt: draft.procedureAt,
          controlAppointmentAt: draft.controlAppointmentAt,
          versionId,
          contacts,
        });
        await auditFollowup(tx, actor, "followup.prepared", followupId, {
          source: "manual",
          treatments: 0,
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
        await auditFollowup(tx, actor, "followup.protocol_chosen", followupId, {
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

        const save = { tx, actor, followupId, followup, data, now };
        const changes = await applySheetHeader(save, options.launch);
        const toValidate = await applyTreatmentDecisions(save, canSteer);
        const revision = followup.planRevision + 1;
        const steps = await replaceFutureSteps(save, draft, revision);

        await tx
          .update(followups)
          .set({ ...changes, planRevision: revision })
          .where(eq(followups.id, followupId));
        if (!draft) {
          // Les rappels à venir suivent la nouvelle fiche ; ceux déjà partis ne changent pas.
          await scheduleReminders(tx, followupId, now);
          await scheduleAutomaticEnd(tx, followupId, now);
        }
        await auditFollowup(tx, actor, "followup.plan_updated", followupId, {
          revision,
          status: followup.status,
          steps,
          alerts: data.alerts.length,
          treatmentsAdded: data.addTreatments.length,
          treatmentsRemoved: data.removeTreatmentIds.length,
        });
        if (toValidate.length)
          await auditFollowup(
            tx,
            actor,
            "followup.treatments_validated",
            followupId,
            {
              count: toValidate.length,
            },
          );
        if (options.launch) await launchInTx(tx, actor, followupId, now);
      });
    },

    /**
     * File « Prêts à lancer » (ADR 0046) : brouillons que l'acteur peut préparer, ceux qu'il
     * lance lui-même d'abord, chacun avec ce qui manque encore et les traitements à valider.
     */
    async readyQueue(actor: Actor): Promise<ReadyDraft[]> {
      assertCanPrepare(actor);
      return run(actor, async (tx) => {
        const drafts = await tx
          .select({ id: followups.id })
          .from(followups)
          .where(
            and(eq(followups.status, "draft"), eq(followups.isTest, false)),
          )
          .orderBy(desc(followups.procedureAt))
          .limit(MAX_READY_DRAFTS);
        if (!drafts.length) return [];
        const whatsappReady = await isConnected(tx, "whatsapp");
        const queue: ReadyDraft[] = [];
        for (const { id } of drafts) {
          const followup = await loadFollowup(tx, actor, id).catch(
            (error: unknown) => {
              if (error instanceof DomainError) return null;
              throw error;
            },
          );
          if (!followup || !canPrepareFollowup(actor, followup.access))
            continue;
          const { blocker } = await launchReadiness(
            tx,
            followup,
            whatsappReady,
          );
          const [responsible] = await tx
            .select({ name: users.displayName })
            .from(memberships)
            .innerJoin(users, eq(users.id, memberships.userId))
            .where(eq(memberships.id, followup.responsibleMembershipId));
          const [version] = followup.protocolVersionId
            ? await tx
                .select({ name: protocolVersions.name })
                .from(protocolVersions)
                .where(eq(protocolVersions.id, followup.protocolVersionId))
            : [];
          const treatments = await pendingImports(tx, id);
          queue.push({
            id,
            animalName: followup.animalName,
            species: followup.species,
            procedure: followup.procedure,
            procedureAt: followup.procedureAt,
            protocolName: version?.name ?? null,
            firstContactAt: followup.firstContactAt,
            controlAppointmentAt: followup.controlAppointmentAt,
            responsibleName: responsible?.name ?? "—",
            canLaunch: canLaunchFollowup(
              actor,
              followup.access,
              followup.responsibleMembershipId,
            ),
            blocker,
            treatments,
          });
        }
        return queue.sort((a, b) => Number(b.canLaunch) - Number(a.canLaunch));
      });
    },

    /**
     * « Lancer » et « Tout lancer » depuis la file : pour chaque suivi, les traitements importés
     * relus sont validés puis le suivi est lancé, dans sa propre transaction. Si la liste des
     * traitements a changé depuis l'affichage, rien n'est fait pour ce suivi. Un seul suivi : le
     * refus remonte tel quel ; plusieurs : les refus sont comptés.
     */
    async launchFromQueue(
      actor: Actor,
      input: unknown,
      now = new Date(),
    ): Promise<{ launched: number; failed: number }> {
      assertCanPrepare(actor);
      const parsed = queueLaunchInput.safeParse(input);
      if (!parsed.success) throw new DomainError("invalid_target");
      const items = parsed.data;
      const launchOne = (item: (typeof items)[number]) =>
        run(actor, async (tx) => {
          const followup = await loadFollowup(tx, actor, item.followupId, true);
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
          const pending = (await pendingImports(tx, item.followupId)).map(
            (treatment) => treatment.id,
          );
          const reviewed = new Set(item.treatmentIds);
          if (
            reviewed.size !== pending.length ||
            pending.some((id) => !reviewed.has(id))
          )
            throw new DomainError("sheet_changed");
          if (pending.length) {
            await tx
              .update(followupTreatments)
              .set({
                validatedByMembershipId: actor.membershipId,
                validatedAt: now,
              })
              .where(inArray(followupTreatments.id, pending));
            await auditFollowup(
              tx,
              actor,
              "followup.treatments_validated",
              item.followupId,
              { count: pending.length, via: "queue" },
            );
          }
          await launchInTx(tx, actor, item.followupId, now, "queue");
        });
      const [only] = items;
      if (only && items.length === 1) {
        await launchOne(only);
        return { launched: 1, failed: 0 };
      }
      let launched = 0;
      for (const item of items)
        try {
          await launchOne(item);
          launched += 1;
        } catch (error) {
          if (!(error instanceof DomainError)) throw error;
        }
      return { launched, failed: items.length - launched };
    },

    /** Programme du suivi lancé (étapes et fin automatique), réservé à l'accès clinique. */
    async programme(actor: Actor, followupId: string): Promise<ProgrammeView> {
      assertPermission(actor, "clinical.read");
      return run(actor, async (tx) =>
        programmeIn(tx, actor, await loadFollowup(tx, actor, followupId)),
      );
    },

    programmeIn,

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
        await auditFollowup(tx, actor, transition.action, followupId, {
          from: followup.status,
        });
      });
    },
  };
}

export type LaunchService = ReturnType<typeof launchService>;
