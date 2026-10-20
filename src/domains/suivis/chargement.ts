import { and, asc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";

import type { DrVetoAnimalHit } from "@/adapters/drveto/types";
import { DomainError } from "@/domains/equipe/actor";
import type { Actor } from "@/domains/equipe/actor";
import { canReadProtocol } from "@/domains/protocoles/policies";
import { enqueue } from "@/domains/taches/queue";
import {
  alertRules,
  animalOwners,
  animals,
  consents,
  followupAlertRules,
  followupShares,
  followupSteps,
  followupTreatments,
  followups,
  integrationConnections,
  ownerContacts,
  owners,
  protocolSteps,
  protocolVersions,
  protocols,
} from "@/server/db/schema";
import type { TenantTransaction } from "@/server/db/tenant";

import { nextSendTime } from "./envoi";
import { messageWindows } from "./rappels";
import { followupAccess } from "./policies";
import type { FollowupAccess } from "./policies";

/**
 * Briques du lancement d'un suivi : types de la fiche, transitions d'état, chargement d'un
 * suivi avec les droits de l'acteur, protocoles et vétérinaires disponibles, copie d'un
 * protocole, propriétaire rattaché et premier message de Numa.
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

export const uuid = z.uuid();
export const searchQuery = z.string().trim().min(2).max(80);
export const drVetoRef = z.string().regex(/^[A-Za-z0-9-]{3,64}$/);

export const TRANSITIONS: Record<
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

export async function isConnected(
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
  /** Membres avec qui le dossier est partagé en ce moment. */
  sharedWith: string[];
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
  const sharedWith = shares.map((share) => share.membershipId);
  const access = followupAccess(actor, {
    responsibleMembershipId: row.responsibleMembershipId,
    isPrivate: row.isPrivate,
    sharedWith,
  });
  if (access === "none") throw new DomainError("not_found");
  return { ...row, sharedWith, access };
}

/** Protocoles validés, non archivés et lisibles par l'acteur. */
export async function protocolChoices(tx: TenantTransaction, actor: Actor) {
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

export async function currentSteps(tx: TenantTransaction, followupId: string) {
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

export async function currentAlerts(tx: TenantTransaction, followupId: string) {
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
export async function upsertOwner(
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
export async function scheduleIntro(
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
