import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import type { DrVetoConnector } from "@/adapters/drveto/types";
import { DomainError, assertPermission } from "@/domains/equipe/actor";
import type { Actor } from "@/domains/equipe/actor";
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
import {
  canLaunchFollowup,
  canPrepareFollowup,
  canSteerFollowup,
} from "./policies";
import type {
  DrVetoSearchHit,
  LaunchSheet,
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
    await auditFollowup(tx, actor, "followup.launched", followupId, {
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

  /** Vétérinaire responsable proposé : l'acteur s'il l'est, sinon le premier actif. */
  async function defaultResponsible(tx: TenantTransaction, actor: Actor) {
    if (VET_ROLES.has(actor.role)) return actor.membershipId;
    const [first] = await activeVets(tx);
    if (!first) throw new DomainError("invalid_target");
    return first.membershipId;
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

        const responsible = await defaultResponsible(tx, actor);

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
            // Changer de responsable et lancer sont deux décisions distinctes (ADR 0015 §6).
            // Un vétérinaire ne reprend pas le brouillon d'un confrère : seuls l'équipe qui
            // prépare, le responsable actuel et un administrateur de l'équipe le réattribuent.
            if (options.launch) throw new DomainError("invalid_transition");
            if (
              actor.role !== "assistant" &&
              actor.membershipId !== followup.responsibleMembershipId &&
              !actor.permissions.has("team.manage")
            )
              throw new DomainError("forbidden");
            const vets = await activeVets(tx);
            if (
              !vets.some(
                (vet) => vet.membershipId === data.responsibleMembershipId,
              )
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
                  // Accord déjà noté : sa date et son auteur restent ceux d'origine.
                  data.whatsappOptIn
                    ? isNull(followupContacts.whatsappOptinAt)
                    : sql`true`,
                ),
              );
          if (data.whatsappOptIn !== undefined)
            await auditFollowup(
              tx,
              actor,
              "followup.whatsapp_optin",
              followupId,
              {
                given: data.whatsappOptIn,
              },
            );
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
        await auditFollowup(tx, actor, "followup.plan_updated", followupId, {
          revision,
          status: followup.status,
          steps: kept.length + data.steps.length,
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
        await auditFollowup(tx, actor, transition.action, followupId, {
          from: followup.status,
        });
      });
    },
  };
}

export type LaunchService = ReturnType<typeof launchService>;
