import { randomInt } from "node:crypto";

import { and, asc, eq, gt, isNull } from "drizzle-orm";

import { auditFollowup } from "@/domains/audit/journal";
import { DomainError, assertPermission } from "@/domains/commun/actor";
import type { Actor } from "@/domains/commun/actor";
import { maskPhone } from "@/domains/whatsapp/numero";
import {
  followupContacts,
  followups,
  organizations,
  ownerContacts,
  owners,
  whatsappAccounts,
} from "@/server/db/schema";
import { fingerprint } from "@/server/crypto/fingerprint";
import { tenantRunner } from "@/server/db/tenant";
import type { Database, TenantTransaction } from "@/server/db/tenant";

import { loadFollowup } from "./chargement";
import { canPrepareFollowup } from "./policies";

/**
 * Accord WhatsApp par QR code à l'accueil (ADR 0051). Le propriétaire scanne : WhatsApp
 * s'ouvre vers le numéro du cabinet avec un message prêt qui porte un code à usage unique.
 * Envoyé depuis le numéro noté dans sa fiche, ce message vaut l'accord préalable que l'équipe
 * cochait à sa place. Un code ne sert qu'une fois, une heure au plus, et pour ce numéro seul.
 */

export const OPTIN_CODE_MINUTES = 60;

// Sans 0, O, 1, I ni L : un code se relit sans hésiter. 31 signes, 8 caractères.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;
const CODE_IN_TEXT = new RegExp(
  `\\bACCORD-([${ALPHABET}]{${CODE_LENGTH}})\\b`,
  "i",
);

export function createOptInCode(): string {
  let code = "ACCORD-";
  for (let index = 0; index < CODE_LENGTH; index += 1)
    code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

/** Empreinte à clé : la base ne garde jamais le code. */
const codeHash = (code: string) => fingerprint(`optin:${code.toUpperCase()}`);

/** Code d'accord lu dans un message reçu, ou null. */
export function optInCodeIn(text: string): string | null {
  const match = CODE_IN_TEXT.exec(text);
  return match?.[1] ? `ACCORD-${match[1].toUpperCase()}` : null;
}

/** Message prêt que le propriétaire envoie : ce qu'il accepte, puis le code. */
export function optInMessage(
  language: "fr" | "en",
  organizationName: string,
  code: string,
): string {
  return language === "en"
    ? `Hello, I agree that ${organizationName} may contact me on WhatsApp about my pet's follow-up. Code ${code}`
    : `Bonjour, j'accepte que ${organizationName} me contacte sur WhatsApp pour le suivi de mon animal. Code ${code}`;
}

export type OptInContact = {
  id: string;
  name: string;
  role: "primary" | "secondary";
  /** Numéro masqué : la personne vérifie que c'est bien le sien. */
  phone: string;
  language: "fr" | "en";
  optedIn: boolean;
};

export type OptInCode = {
  contactId: string;
  code: string;
  /** Texte envoyé par le propriétaire. */
  message: string;
  /** Lien wa.me du QR code ; null en simulation (aucun vrai numéro). */
  link: string | null;
  expiresAt: Date;
};

export function optInService(deps: {
  db: Database;
  /** WhatsApp réel : le QR code ouvre une vraie conversation avec le cabinet. */
  live: boolean;
}) {
  const run = tenantRunner(deps.db);

  /** Brouillon que l'acteur prépare, hors suivi test (un suivi test n'envoie rien). */
  async function draftFor(tx: TenantTransaction, actor: Actor, id: string) {
    assertPermission(actor, "followups.launch");
    assertPermission(actor, "clinical.read");
    const followup = await loadFollowup(tx, actor, id);
    if (!canPrepareFollowup(actor, followup.access))
      throw new DomainError("forbidden");
    if (followup.status !== "draft" || followup.isTest)
      throw new DomainError("invalid_transition");
    return followup;
  }

  function contactsOf(tx: TenantTransaction, followupId: string) {
    return tx
      .select({
        id: followupContacts.id,
        name: owners.fullName,
        role: followupContacts.role,
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
      .where(
        and(
          eq(followupContacts.followupId, followupId),
          eq(followupContacts.active, true),
        ),
      )
      .orderBy(asc(followupContacts.role));
  }

  return {
    /** Contacts actifs du brouillon et leur accord, sans aucun code. */
    async status(
      actor: Actor,
      followupId: string,
    ): Promise<{
      animalName: string;
      practiceName: string;
      contacts: OptInContact[];
    }> {
      return run(actor, async (tx) => {
        const followup = await draftFor(tx, actor, followupId);
        const contacts = await contactsOf(tx, followupId);
        const [practice] = await tx
          .select({ name: organizations.name })
          .from(organizations)
          .where(eq(organizations.id, actor.organizationId));
        return {
          animalName: followup.animalName,
          practiceName: practice?.name ?? "",
          contacts: contacts.map((contact) => ({
            id: contact.id,
            name: contact.name,
            role: contact.role,
            phone: maskPhone(contact.phone),
            language: contact.language,
            optedIn: contact.optinAt !== null,
          })),
        };
      });
    },

    /**
     * Un nouveau code par contact encore sans accord ; il remplace le précédent. Seule son
     * empreinte est gardée : le code ne s'affiche qu'à celui qui vient de le demander.
     */
    async issueCodes(
      actor: Actor,
      followupId: string,
      now = new Date(),
    ): Promise<OptInCode[]> {
      return run(actor, async (tx) => {
        await draftFor(tx, actor, followupId);
        const [cabinet] = await tx
          .select({
            name: organizations.name,
            phone: whatsappAccounts.displayPhone,
          })
          .from(organizations)
          .leftJoin(
            whatsappAccounts,
            eq(whatsappAccounts.organizationId, organizations.id),
          )
          .where(eq(organizations.id, actor.organizationId));
        if (!cabinet) throw new DomainError("not_found");
        // WhatsApp réel sans numéro public connu (relié avant 0034) : pas de QR code possible.
        if (deps.live && !cabinet.phone)
          throw new DomainError("integration_missing");
        const expiresAt = new Date(now.getTime() + OPTIN_CODE_MINUTES * 60_000);
        const codes: OptInCode[] = [];
        for (const contact of await contactsOf(tx, followupId)) {
          if (contact.optinAt) continue;
          const code = createOptInCode();
          await tx
            .update(followupContacts)
            .set({
              optinCodeHash: codeHash(code),
              optinCodeExpiresAt: expiresAt,
              optinCodeByMembershipId: actor.membershipId,
            })
            .where(eq(followupContacts.id, contact.id));
          const message = optInMessage(contact.language, cabinet.name, code);
          codes.push({
            contactId: contact.id,
            code,
            message,
            link:
              deps.live && cabinet.phone
                ? `https://wa.me/${cabinet.phone.slice(1)}?text=${encodeURIComponent(message)}`
                : null,
            expiresAt,
          });
        }
        return codes;
      });
    },

    /**
     * WhatsApp simulé seulement : le téléphone du contact « envoie » le message du QR code,
     * par le même chemin que le webhook. Vrai si l'accord a été noté.
     */
    async simulateScan(
      actor: Actor,
      followupId: string,
      code: string,
      now = new Date(),
    ): Promise<boolean> {
      if (deps.live) throw new DomainError("invalid_target");
      return run(actor, async (tx) => {
        await draftFor(tx, actor, followupId);
        const [contact] = await tx
          .select({ phone: ownerContacts.value })
          .from(followupContacts)
          .innerJoin(
            ownerContacts,
            eq(ownerContacts.id, followupContacts.ownerContactId),
          )
          .where(
            and(
              eq(followupContacts.followupId, followupId),
              eq(followupContacts.optinCodeHash, codeHash(code)),
            ),
          );
        if (!contact) return false;
        return acceptOptInCode(tx, { code, from: contact.phone.slice(1) }, now);
      });
    },
  };
}

export type OptInService = ReturnType<typeof optInService>;

/**
 * Message reçu qui porte un code d'accord (webhook, transaction du cabinet) : accord noté si
 * le code est en cours, pour un brouillon, et s'il vient du numéro de ce contact. Sinon rien,
 * et rien n'est gardé du message. Vrai si l'accord a été noté.
 */
export async function acceptOptInCode(
  tx: TenantTransaction,
  input: { code: string; from: string | undefined },
  now: Date,
): Promise<boolean> {
  // Sans numéro (identifiant WhatsApp seul), rien ne prouve que c'est le bon téléphone.
  if (!input.from) return false;
  const [contact] = await tx
    .select({
      id: followupContacts.id,
      organizationId: followupContacts.organizationId,
      followupId: followupContacts.followupId,
      phone: ownerContacts.value,
      shownBy: followupContacts.optinCodeByMembershipId,
    })
    .from(followupContacts)
    .innerJoin(
      ownerContacts,
      eq(ownerContacts.id, followupContacts.ownerContactId),
    )
    .innerJoin(followups, eq(followups.id, followupContacts.followupId))
    .where(
      and(
        eq(followupContacts.optinCodeHash, codeHash(input.code)),
        gt(followupContacts.optinCodeExpiresAt, now),
        eq(followupContacts.active, true),
        isNull(followupContacts.whatsappOptinAt),
        eq(followups.status, "draft"),
        eq(followups.isTest, false),
      ),
    )
    .for("update", { of: followupContacts });
  if (!contact?.shownBy || contact.phone !== `+${input.from}`) return false;
  await tx
    .update(followupContacts)
    .set({
      whatsappOptinAt: now,
      whatsappOptinByMembershipId: contact.shownBy,
      optinCodeHash: null,
      optinCodeExpiresAt: null,
      optinCodeByMembershipId: null,
    })
    .where(eq(followupContacts.id, contact.id));
  await auditFollowup(
    tx,
    { organizationId: contact.organizationId, membershipId: contact.shownBy },
    "followup.whatsapp_optin_qr",
    contact.followupId,
  );
  return true;
}
