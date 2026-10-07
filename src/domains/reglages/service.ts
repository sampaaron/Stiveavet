import { randomUUID } from "node:crypto";

import { and, asc, count, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";

import type { DrVetoConnector } from "@/adapters/drveto/types";
import type { PaymentMandateProvider } from "@/adapters/payments/types";
import type { WhatsAppConnector } from "@/adapters/whatsapp/types";
import type { AuditMetadata } from "@/domains/audit/schema";
import { DomainError, assertPermission } from "@/domains/equipe/actor";
import type { Actor } from "@/domains/equipe/actor";
import { VET_ROLES } from "@/domains/equipe/permissions";
import { canReadProtocol } from "@/domains/protocoles/policies";
import {
  animalOwners,
  animals,
  auditEvents,
  availabilityWindows,
  emergencyContacts,
  emergencyInstructions,
  followups,
  integrationConnections,
  memberships,
  onCallSchedules,
  onboardingSteps,
  organizationSettings,
  organizations,
  owners,
  protocolVersions,
  protocols,
  users,
} from "@/server/db/schema";
import { withTenant } from "@/server/db/tenant";
import type { Database, TenantTransaction } from "@/server/db/tenant";

import {
  DEFAULT_INSTRUCTIONS,
  DEFAULT_MESSAGE_WINDOWS,
  EMERGENCY_PERIODS,
  alertSettingsInput,
  contactInput,
  instructionsInput,
  messageWindowsInput,
} from "./content";
import type { EmergencyPeriod, WindowInput } from "./content";

export const ONBOARDING_STEPS = [
  "organization",
  "whatsapp",
  "drveto",
  "rules",
  "team",
  "protocols",
  "billing",
  "test_followup",
] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export type Integration = "whatsapp" | "drveto" | "payment_mandate";

export type SettingsView = {
  escalationDelayMinutes: number;
  photoAnalysisEnabled: boolean;
  messageWindows: WindowInput[];
  instructions: Partial<Record<EmergencyPeriod, string>>;
  contacts: { id: string; label: string; phone: string }[];
  onCall: {
    id: string;
    membershipId: string;
    name: string;
    startsAt: Date;
    endsAt: Date;
  }[];
  onCallCandidates: { membershipId: string; name: string }[];
  integrations: Partial<
    Record<Integration, { displayLabel: string; connectedAt: Date }>
  >;
};

export type OnboardingView = {
  steps: Record<OnboardingStep, boolean>;
  completed: number;
  /** Protocoles validés du cabinet, pour le suivi test. */
  validatedProtocols: { id: string; name: string }[];
};

const uuid = z.uuid();
const MAX_CONTACTS = 6;
const ON_CALL_MAX_DAYS = 14;

/** `08:00:00` (PostgreSQL) → `08:00`. */
const hhmm = (value: string) => value.slice(0, 5);

function audit(
  tx: TenantTransaction,
  actor: Actor,
  action: string,
  metadata: AuditMetadata = {},
) {
  return tx.insert(auditEvents).values({
    organizationId: actor.organizationId,
    actorMembershipId: actor.membershipId,
    action,
    targetType: "organization",
    targetId: actor.organizationId,
    metadata,
  });
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new DomainError("invalid_target");
  return parsed.data;
}

export function settingsService(deps: {
  db: Database;
  whatsapp: WhatsAppConnector;
  drveto: DrVetoConnector;
  payments: PaymentMandateProvider;
}) {
  const { db } = deps;
  const run = <T>(actor: Actor, fn: (tx: TenantTransaction) => Promise<T>) => {
    assertPermission(actor, "organization.settings");
    return withTenant(
      db,
      { organizationId: actor.organizationId, userId: actor.userId },
      fn,
    );
  };

  async function upsertSettings(
    tx: TenantTransaction,
    actor: Actor,
    values: { escalationDelayMinutes?: number; photoAnalysisEnabled?: boolean },
  ) {
    await tx
      .insert(organizationSettings)
      .values({
        organizationId: actor.organizationId,
        updatedByMembershipId: actor.membershipId,
        ...values,
      })
      .onConflictDoUpdate({
        target: organizationSettings.organizationId,
        set: { ...values, updatedByMembershipId: actor.membershipId },
      });
  }

  async function replaceWindows(
    tx: TenantTransaction,
    actor: Actor,
    windows: WindowInput[],
  ) {
    await tx
      .delete(availabilityWindows)
      .where(eq(availabilityWindows.kind, "messages"));
    if (windows.length)
      await tx.insert(availabilityWindows).values(
        windows.map((window) => ({
          organizationId: actor.organizationId,
          kind: "messages" as const,
          weekday: window.weekday,
          startsAt: window.startsAt,
          endsAt: window.endsAt,
        })),
      );
  }

  async function upsertInstructions(
    tx: TenantTransaction,
    actor: Actor,
    period: EmergencyPeriod,
    instructions: string,
  ) {
    await tx
      .insert(emergencyInstructions)
      .values({
        organizationId: actor.organizationId,
        period,
        instructions,
        updatedByMembershipId: actor.membershipId,
      })
      .onConflictDoUpdate({
        target: [
          emergencyInstructions.organizationId,
          emergencyInstructions.period,
        ],
        set: { instructions, updatedByMembershipId: actor.membershipId },
      });
  }

  /** Verrou du cabinet : sérialise les écritures qui vérifient un chevauchement. */
  async function lockOrganization(tx: TenantTransaction) {
    await tx.select({ id: organizations.id }).from(organizations).for("update");
  }

  return {
    async get(actor: Actor): Promise<SettingsView> {
      return run(actor, async (tx) => {
        const [settings] = await tx.select().from(organizationSettings);
        const windows = await tx
          .select()
          .from(availabilityWindows)
          .where(eq(availabilityWindows.kind, "messages"))
          .orderBy(asc(availabilityWindows.weekday));
        const instructions = await tx.select().from(emergencyInstructions);
        const contacts = await tx
          .select()
          .from(emergencyContacts)
          .orderBy(asc(emergencyContacts.position));
        const onCall = await tx
          .select({
            id: onCallSchedules.id,
            membershipId: onCallSchedules.membershipId,
            name: users.displayName,
            startsAt: onCallSchedules.startsAt,
            endsAt: onCallSchedules.endsAt,
          })
          .from(onCallSchedules)
          .innerJoin(
            memberships,
            eq(memberships.id, onCallSchedules.membershipId),
          )
          .innerJoin(users, eq(users.id, memberships.userId))
          .where(gt(onCallSchedules.endsAt, new Date()))
          .orderBy(asc(onCallSchedules.startsAt));
        const candidates = await tx
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
        const integrations = await tx.select().from(integrationConnections);
        return {
          escalationDelayMinutes: settings?.escalationDelayMinutes ?? 240,
          photoAnalysisEnabled: settings?.photoAnalysisEnabled ?? false,
          messageWindows: windows.map((window) => ({
            weekday: window.weekday as WindowInput["weekday"],
            startsAt: hhmm(window.startsAt),
            endsAt: hhmm(window.endsAt),
          })),
          instructions: Object.fromEntries(
            instructions.map((row) => [row.period, row.instructions]),
          ),
          contacts: contacts.map(({ id, label, phone }) => ({
            id,
            label,
            phone,
          })),
          onCall,
          onCallCandidates: candidates,
          integrations: Object.fromEntries(
            integrations.map((row) => [
              row.provider,
              { displayLabel: row.displayLabel, connectedAt: row.connectedAt },
            ]),
          ),
        };
      });
    },

    async onboarding(actor: Actor): Promise<OnboardingView> {
      return run(actor, async (tx) => {
        const integrations = new Set(
          (
            await tx
              .select({ provider: integrationConnections.provider })
              .from(integrationConnections)
          ).map((row) => row.provider),
        );
        const [windows] = await tx
          .select({ n: count() })
          .from(availabilityWindows)
          .where(eq(availabilityWindows.kind, "messages"));
        const [contacts] = await tx
          .select({ n: count() })
          .from(emergencyContacts);
        const [instructions] = await tx
          .select({ n: count() })
          .from(emergencyInstructions);
        const manual = new Set(
          (
            await tx
              .select({ step: onboardingSteps.step })
              .from(onboardingSteps)
          ).map((row) => row.step),
        );
        const validatedProtocols = await tx
          .select({ id: protocols.id, name: protocolVersions.name })
          .from(protocols)
          .innerJoin(
            protocolVersions,
            eq(protocolVersions.id, protocols.currentVersionId),
          )
          .where(
            and(
              isNull(protocols.ownerMembershipId),
              isNull(protocols.archivedAt),
              sql`${protocolVersions.validatedAt} IS NOT NULL`,
            ),
          )
          .orderBy(asc(protocolVersions.name));
        const [tests] = await tx
          .select({ n: count() })
          .from(followups)
          .where(eq(followups.isTest, true));

        const steps: Record<OnboardingStep, boolean> = {
          organization: true,
          whatsapp: integrations.has("whatsapp"),
          drveto: integrations.has("drveto"),
          rules:
            (windows?.n ?? 0) > 0 &&
            (contacts?.n ?? 0) > 0 &&
            (instructions?.n ?? 0) === EMERGENCY_PERIODS.length,
          team: manual.has("team"),
          protocols: validatedProtocols.length > 0,
          billing: integrations.has("payment_mandate"),
          test_followup: (tests?.n ?? 0) > 0,
        };
        return {
          steps,
          completed: Object.values(steps).filter(Boolean).length,
          validatedProtocols,
        };
      });
    },

    /** Horaires d'envoi, consignes d'urgence et règles d'alerte par défaut, à adapter. */
    async applyDefaults(actor: Actor) {
      await run(actor, async (tx) => {
        const [windows] = await tx
          .select({ n: count() })
          .from(availabilityWindows)
          .where(eq(availabilityWindows.kind, "messages"));
        if ((windows?.n ?? 0) === 0)
          await replaceWindows(tx, actor, DEFAULT_MESSAGE_WINDOWS);
        const existing = new Set(
          (
            await tx
              .select({ period: emergencyInstructions.period })
              .from(emergencyInstructions)
          ).map((row) => row.period),
        );
        for (const period of EMERGENCY_PERIODS)
          if (!existing.has(period))
            await upsertInstructions(
              tx,
              actor,
              period,
              DEFAULT_INSTRUCTIONS[period],
            );
        await tx
          .insert(organizationSettings)
          .values({
            organizationId: actor.organizationId,
            updatedByMembershipId: actor.membershipId,
          })
          .onConflictDoNothing();
        await audit(tx, actor, "settings.defaults_applied");
      });
    },

    async saveMessageWindows(actor: Actor, windows: unknown) {
      const parsed = parse(messageWindowsInput, windows);
      await run(actor, async (tx) => {
        await replaceWindows(tx, actor, parsed);
        await audit(tx, actor, "settings.message_windows_changed", {
          days: parsed.length,
        });
      });
    },

    async saveInstructions(
      actor: Actor,
      period: EmergencyPeriod,
      instructions: string,
    ) {
      const text = parse(instructionsInput, instructions);
      if (!EMERGENCY_PERIODS.includes(period))
        throw new DomainError("invalid_target");
      await run(actor, async (tx) => {
        await upsertInstructions(tx, actor, period, text);
        await audit(tx, actor, "settings.emergency_instructions_changed", {
          period,
        });
      });
    },

    async addContact(actor: Actor, input: unknown) {
      const contact = parse(contactInput, input);
      await run(actor, async (tx) => {
        await lockOrganization(tx);
        const existing = await tx
          .select({ position: emergencyContacts.position })
          .from(emergencyContacts);
        if (existing.length >= MAX_CONTACTS)
          throw new DomainError("invalid_target");
        const position =
          Math.max(0, ...existing.map((row) => row.position)) + 1;
        await tx.insert(emergencyContacts).values({
          organizationId: actor.organizationId,
          label: contact.label,
          phone: contact.phone,
          position,
        });
        // Le numéro n'est jamais journalisé.
        await audit(tx, actor, "settings.emergency_contact_added");
      });
    },

    async removeContact(actor: Actor, contactId: string) {
      if (!uuid.safeParse(contactId).success)
        throw new DomainError("not_found");
      await run(actor, async (tx) => {
        const removed = await tx
          .delete(emergencyContacts)
          .where(eq(emergencyContacts.id, contactId))
          .returning({ id: emergencyContacts.id });
        if (!removed.length) throw new DomainError("not_found");
        await audit(tx, actor, "settings.emergency_contact_removed");
      });
    },

    async saveAlertSettings(actor: Actor, input: unknown) {
      const values = parse(alertSettingsInput, input);
      await run(actor, async (tx) => {
        await upsertSettings(tx, actor, values);
        await audit(tx, actor, "settings.alerts_changed", values);
      });
    },

    /** Garde d'un vétérinaire actif, sans chevauchement avec une autre garde. */
    async addOnCall(
      actor: Actor,
      input: { membershipId: string; startsAt: Date; endsAt: Date },
    ) {
      if (!uuid.safeParse(input.membershipId).success)
        throw new DomainError("invalid_target");
      const { startsAt, endsAt } = input;
      if (
        Number.isNaN(startsAt.getTime()) ||
        Number.isNaN(endsAt.getTime()) ||
        endsAt <= startsAt ||
        endsAt.getTime() <= Date.now() ||
        endsAt.getTime() - startsAt.getTime() > ON_CALL_MAX_DAYS * 86_400_000
      )
        throw new DomainError("invalid_target");
      await run(actor, async (tx) => {
        await lockOrganization(tx);
        const [vet] = await tx
          .select({ role: memberships.role })
          .from(memberships)
          .where(
            and(
              eq(memberships.id, input.membershipId),
              isNull(memberships.deactivatedAt),
            ),
          );
        if (!vet || !VET_ROLES.has(vet.role))
          throw new DomainError("invalid_target");
        const [overlap] = await tx
          .select({ id: onCallSchedules.id })
          .from(onCallSchedules)
          .where(
            and(
              lt(onCallSchedules.startsAt, endsAt),
              gt(onCallSchedules.endsAt, startsAt),
            ),
          )
          .limit(1);
        if (overlap) throw new DomainError("on_call_overlap");
        const id = randomUUID();
        await tx.insert(onCallSchedules).values({
          id,
          organizationId: actor.organizationId,
          membershipId: input.membershipId,
          startsAt,
          endsAt,
          createdByMembershipId: actor.membershipId,
        });
        await audit(tx, actor, "settings.on_call_added", {
          membershipId: input.membershipId,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
        });
      });
    },

    async removeOnCall(actor: Actor, scheduleId: string) {
      if (!uuid.safeParse(scheduleId).success)
        throw new DomainError("not_found");
      await run(actor, async (tx) => {
        // Une garde passée reste dans l'historique.
        const removed = await tx
          .delete(onCallSchedules)
          .where(
            and(
              eq(onCallSchedules.id, scheduleId),
              gt(onCallSchedules.endsAt, new Date()),
            ),
          )
          .returning({ membershipId: onCallSchedules.membershipId });
        if (!removed.length) throw new DomainError("not_found");
        await audit(tx, actor, "settings.on_call_removed", {
          membershipId: removed[0]?.membershipId ?? null,
        });
      });
    },

    /** Connexion simulée (ADR 0004) : seul un libellé masqué est conservé. */
    async connect(actor: Actor, provider: Integration, input: string) {
      let displayLabel: string;
      if (provider === "whatsapp") {
        const phone = parse(contactInput.shape.phone, input);
        displayLabel = (await deps.whatsapp.connectBusinessNumber(phone))
          .displayLabel;
      } else if (provider === "drveto") {
        const code = parse(
          z
            .string()
            .trim()
            .regex(/^[A-Za-z0-9-]{3,32}$/),
          input,
        );
        displayLabel = (await deps.drveto.connectPractice(code)).displayLabel;
      } else {
        displayLabel = (await deps.payments.signMandate(actor.organizationId))
          .displayLabel;
      }
      await run(actor, async (tx) => {
        await tx
          .insert(integrationConnections)
          .values({
            organizationId: actor.organizationId,
            provider,
            displayLabel,
            connectedByMembershipId: actor.membershipId,
          })
          .onConflictDoNothing();
        await audit(tx, actor, "integration.connected", {
          provider,
          simulated: true,
        });
      });
    },

    async disconnect(actor: Actor, provider: Integration) {
      await run(actor, async (tx) => {
        await tx
          .delete(integrationConnections)
          .where(eq(integrationConnections.provider, provider));
        await audit(tx, actor, "integration.disconnected", { provider });
      });
    },

    /** Étape déclarée terminée par l'administrateur (équipe : invitée, ou travail seul). */
    async completeStep(actor: Actor, step: "team") {
      await run(actor, async (tx) => {
        await tx
          .insert(onboardingSteps)
          .values({
            organizationId: actor.organizationId,
            step,
            completedByMembershipId: actor.membershipId,
          })
          .onConflictDoNothing();
        await audit(tx, actor, "onboarding.step_completed", { step });
      });
    },

    /**
     * Suivi test de l'installation : un animal et un propriétaire fictifs, en brouillon,
     * jamais compté ni facturé, et qui n'envoie aucun message. Il exige un protocole validé.
     */
    async createTestFollowup(actor: Actor, protocolId: string) {
      assertPermission(actor, "followups.launch");
      if (!VET_ROLES.has(actor.role)) throw new DomainError("forbidden");
      if (!uuid.safeParse(protocolId).success)
        throw new DomainError("invalid_target");
      return run(actor, async (tx) => {
        const [protocol] = await tx
          .select({
            ownerMembershipId: protocols.ownerMembershipId,
            archivedAt: protocols.archivedAt,
            versionId: protocolVersions.id,
            validatedAt: protocolVersions.validatedAt,
            name: protocolVersions.name,
          })
          .from(protocols)
          .innerJoin(
            protocolVersions,
            eq(protocolVersions.id, protocols.currentVersionId),
          )
          .where(eq(protocols.id, protocolId));
        if (
          !protocol ||
          !canReadProtocol(actor, protocol) ||
          protocol.archivedAt ||
          !protocol.validatedAt
        )
          throw new DomainError("invalid_target");

        const animalId = randomUUID();
        const ownerId = randomUUID();
        const followupId = randomUUID();
        await tx.insert(animals).values({
          id: animalId,
          organizationId: actor.organizationId,
          name: "Animal test",
          species: "dog",
        });
        await tx.insert(owners).values({
          id: ownerId,
          organizationId: actor.organizationId,
          fullName: "Propriétaire test",
        });
        await tx.insert(animalOwners).values({
          organizationId: actor.organizationId,
          animalId,
          ownerId,
        });
        await tx.insert(followups).values({
          id: followupId,
          organizationId: actor.organizationId,
          animalId,
          responsibleMembershipId: actor.membershipId,
          procedure: protocol.name,
          procedureAt: new Date(),
          status: "draft",
          protocolVersionId: protocol.versionId,
          isTest: true,
        });
        await tx.insert(auditEvents).values({
          organizationId: actor.organizationId,
          actorMembershipId: actor.membershipId,
          action: "followup.test_created",
          targetType: "followup",
          targetId: followupId,
          metadata: {},
        });
        return followupId;
      });
    },
  };
}

export type SettingsService = ReturnType<typeof settingsService>;
