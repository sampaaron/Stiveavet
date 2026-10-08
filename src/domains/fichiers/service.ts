import { randomUUID } from "node:crypto";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import type { AiGateway } from "@/adapters/ai-gateway/types";
import type { ObjectStorage, StoredObject } from "@/adapters/object-storage";
import { recordAudit, systemAuthor } from "@/domains/audit/journal";
import { checkNumaReply } from "@/domains/conversations/guard";
import {
  contactRoleInput,
  currentConsentState,
  processInbound,
  recordInbound,
} from "@/domains/conversations/service";
import type {
  ContactRole,
  InboundOutcome,
} from "@/domains/conversations/service";
import { DomainError, assertPermission } from "@/domains/equipe/actor";
import type { Actor } from "@/domains/equipe/actor";
import { loadFollowup } from "@/domains/suivis/lancement";
import { JobError } from "@/domains/taches/kinds";
import { enqueue } from "@/domains/taches/queue";
import type { JobHandler } from "@/domains/taches/worker";
import {
  animals,
  attachments,
  followups,
  messages,
  organizationSettings,
  photoObservations,
  voiceTranscripts,
} from "@/server/db/schema";
import { tenantRunner, withTenant } from "@/server/db/tenant";
import type { Database, TenantTransaction } from "@/server/db/tenant";

import { signReadLink, verifyReadLink } from "./liens";
import type { SignedLink } from "./liens";
import {
  MAX_PHOTO_BYTES,
  MAX_VOICE_BYTES,
  sha256Hex,
  sniffAudio,
  sniffImage,
  wavDurationMs,
} from "./media";

/**
 * Photos et messages vocaux des propriétaires (cahier des charges §4, architecture §7,
 * ADR 0019).
 * - Le fichier va dans le stockage objet privé ; la base ne garde que sa clé, son type lu
 *   dans le fichier, sa taille, son empreinte et sa date limite de conservation.
 * - Un vocal est transcrit (simulé) par une tâche ; sa transcription suit ensuite le même
 *   chemin qu'un message écrit : accord, triage, réponse de Numa.
 * - L'analyse photo est désactivée par défaut ; activée par le cabinet, elle ne garde que des
 *   observations qui passent les garde-fous de Numa, et seulement après l'accord.
 * - Lecture : lien signé de deux minutes, lié au membre qui a ouvert le dossier ; à chaque
 *   ouverture, la session, l'accès clinique au dossier et le lien sont revérifiés, et
 *   l'ouverture est journalisée (sans contenu).
 */

const TRANSCRIBE_KIND = "media.transcribe";
const OBSERVE_KIND = "media.observe";
export const PURGE_KIND = "attachment.purge";

const MAX_TRANSCRIPT = 10_000;
const MAX_OBSERVATIONS = 6;
const MAX_OBSERVATION_LENGTH = 300;

export const photoCaptionInput = z
  .string()
  .trim()
  .max(1024, "Légende trop longue.");

/** `from` : l'un des deux propriétaires du suivi (le principal par défaut, lot 18). */
export type OwnerMedia =
  | { kind: "photo"; bytes: Uint8Array; caption?: string; from?: unknown }
  | { kind: "voice"; bytes: Uint8Array; from?: unknown };

type CheckedMedia = {
  kind: "photo" | "voice";
  from: ContactRole;
  bytes: Uint8Array;
  caption: string;
  contentType: string;
  extension: string;
  durationMs: number | null;
};

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/mpeg": "mp3",
};

/** Type lu dans le fichier et taille bornée ; sinon refus sans détail. */
function checkMedia(media: OwnerMedia): CheckedMedia {
  const { bytes } = media;
  const role = contactRoleInput.safeParse(media.from ?? "primary");
  if (!role.success) throw new DomainError("not_found");
  const from = role.data;
  if (media.kind === "photo") {
    const contentType = sniffImage(bytes);
    const caption = photoCaptionInput.safeParse(media.caption ?? "");
    if (
      !contentType ||
      bytes.length === 0 ||
      bytes.length > MAX_PHOTO_BYTES ||
      !caption.success
    )
      throw new DomainError("invalid_file");
    return {
      kind: "photo",
      from,
      bytes,
      caption: caption.data,
      contentType,
      extension: EXTENSIONS[contentType] ?? "bin",
      durationMs: null,
    };
  }
  const contentType = sniffAudio(bytes);
  if (!contentType || bytes.length === 0 || bytes.length > MAX_VOICE_BYTES)
    throw new DomainError("invalid_file");
  return {
    kind: "voice",
    from,
    bytes,
    caption: "",
    contentType,
    extension: EXTENSIONS[contentType] ?? "bin",
    durationMs: wavDurationMs(bytes),
  };
}

/** Clé d'objet : cabinet, dossier, identifiant aléatoire ; aucun nom ni contenu. */
function followupObjectKey(
  organizationId: string,
  followupId: string,
  attachmentId: string,
  extension: string,
): string {
  return `o/${organizationId}/suivis/${followupId}/${attachmentId}.${extension}`;
}

/**
 * Fichier déjà déposé, rattaché au message reçu, puis la suite : transcription d'un vocal,
 * ou accusé de réception (et analyse si activée) d'une photo.
 */
async function attachInTx(
  tx: TenantTransaction,
  target: { organizationId: string; followupId: string; messageId: string },
  media: CheckedMedia,
  attachmentId: string,
  storageKey: string,
): Promise<InboundOutcome> {
  const { organizationId, followupId, messageId } = target;
  await tx.insert(attachments).values({
    id: attachmentId,
    organizationId,
    followupId,
    messageId,
    kind: media.kind,
    storageKey,
    contentType: media.contentType,
    byteSize: media.bytes.length,
    sha256: sha256Hex(media.bytes),
    // Plafond de la base ; la purge à un an après la fin du suivi arrive au lot 17.
    retentionUntil: sql`now() + interval '15 months'`,
    durationMs: media.durationMs,
  });
  if (media.kind === "voice") {
    // La transcription décidera de la suite (accord, triage, réponse de Numa).
    await enqueue(tx, {
      organizationId,
      kind: TRANSCRIBE_KIND,
      idempotencyKey: `media:${attachmentId}:transcribe`,
      runAt: new Date(),
      followupId,
      payload: { attachmentId },
    });
    return "stored";
  }
  const { outcome } = await processInbound(
    tx,
    followupId,
    messageId,
    media.caption,
    { media: "photo" },
  );
  const [settings] = await tx
    .select({ enabled: organizationSettings.photoAnalysisEnabled })
    .from(organizationSettings)
    .where(eq(organizationSettings.organizationId, organizationId));
  // Désactivée par défaut (cahier des charges §4) : rien n'est envoyé à l'IA sans réglage.
  if (settings?.enabled)
    await enqueue(tx, {
      organizationId,
      kind: OBSERVE_KIND,
      idempotencyKey: `media:${attachmentId}:observe`,
      runAt: new Date(),
      followupId,
      payload: { attachmentId },
    });
  return outcome;
}

async function receiveInTx(
  tx: TenantTransaction,
  followupId: string,
  media: CheckedMedia,
  attachmentId: string,
  storageKey: string,
): Promise<{ messageId: string; outcome: InboundOutcome }> {
  const { messageId, organizationId } = await recordInbound(
    tx,
    followupId,
    media.caption,
    media.from,
  );
  const outcome = await attachInTx(
    tx,
    { organizationId, followupId, messageId },
    media,
    attachmentId,
    storageKey,
  );
  return { messageId, outcome };
}

/** Motif d'un fichier reçu mais refusé, gardé au journal sans contenu. */
export type MediaRefusal =
  "too_large" | "file_type" | "expired" | "integrity" | "unavailable";

/**
 * Fichier envoyé par WhatsApp (lot 22, ADR 0025), une fois téléchargé chez Meta : type lu
 * dans le contenu, taille bornée, dépôt privé, puis la même suite qu'un fichier du simulateur.
 * Le message reçu existe déjà (enregistré par le webhook, avec la légende). Renvoie le motif
 * d'un refus, sans rien déposer.
 */
export async function storeOwnerMedia(
  tx: TenantTransaction,
  storage: ObjectStorage,
  target: {
    organizationId: string;
    followupId: string;
    messageId: string;
    caption: string;
  },
  media: { kind: "photo" | "voice"; bytes: Uint8Array },
): Promise<MediaRefusal | null> {
  let checked: CheckedMedia;
  try {
    checked = checkMedia({ ...media, caption: target.caption });
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    return media.bytes.length >
      (media.kind === "photo" ? MAX_PHOTO_BYTES : MAX_VOICE_BYTES)
      ? "too_large"
      : "file_type";
  }
  const attachmentId = randomUUID();
  const key = followupObjectKey(
    target.organizationId,
    target.followupId,
    attachmentId,
    checked.extension,
  );
  await storage.putObject(key, {
    bytes: checked.bytes,
    contentType: checked.contentType,
  });
  try {
    // Point de sauvegarde : si l'enregistrement échoue, le fichier déposé est retiré.
    await tx.transaction((inner) =>
      attachInTx(inner, target, checked, attachmentId, key),
    );
  } catch (error) {
    await storage.deleteObject(key);
    throw error;
  }
  return null;
}

/**
 * Fichier refusé : trace au journal (type et motif seulement), trace dans la conversation
 * pour l'équipe, et Numa demande au propriétaire de le renvoyer ou de décrire la situation.
 * La légende éventuelle est triée comme un message écrit.
 */
export async function refuseOwnerMedia(
  tx: TenantTransaction,
  target: {
    organizationId: string;
    followupId: string;
    messageId: string;
    caption: string;
  },
  refusal: { kind: "photo" | "voice" | "other"; reason: MediaRefusal },
) {
  await recordAudit(
    tx,
    systemAuthor(target.organizationId),
    "whatsapp.media_refused",
    { type: "followup", id: target.followupId },
    { kind: refusal.kind, reason: refusal.reason },
  );
  await processInbound(
    tx,
    target.followupId,
    target.messageId,
    target.caption,
    {
      media: "refused",
    },
  );
}

export type MediaService = ReturnType<typeof mediaService>;

export function mediaService(deps: {
  db: Database;
  storage: ObjectStorage;
  /** Clé des liens de lecture signés (ADR 0019). */
  linkSecret: string;
}) {
  const { db, storage, linkSecret } = deps;
  const run = tenantRunner(db);

  /** Dépose le fichier puis l'enregistre ; si l'enregistrement échoue, le fichier part. */
  async function receive(
    organizationId: string,
    followupId: string,
    media: OwnerMedia,
    transaction: <T>(fn: (tx: TenantTransaction) => Promise<T>) => Promise<T>,
  ) {
    if (!z.uuid().safeParse(followupId).success)
      throw new DomainError("not_found");
    const checked = checkMedia(media);
    const attachmentId = randomUUID();
    const key = followupObjectKey(
      organizationId,
      followupId,
      attachmentId,
      checked.extension,
    );
    await storage.putObject(key, {
      bytes: checked.bytes,
      contentType: checked.contentType,
    });
    try {
      const result = await transaction((tx) =>
        receiveInTx(tx, followupId, checked, attachmentId, key),
      );
      return { ...result, attachmentId };
    } catch (error) {
      await storage.deleteObject(key);
      throw error;
    }
  }

  return {
    /** Photo ou vocal reçu par WhatsApp (point d'entrée du futur webhook, phase 3). */
    receiveOwnerMedia(
      organizationId: string,
      followupId: string,
      media: OwnerMedia,
    ) {
      return receive(organizationId, followupId, media, (fn) =>
        withTenant(db, { organizationId }, fn),
      );
    },

    /**
     * Simulateur du propriétaire (local seulement, vérifié par l'appelant) : un membre avec
     * l'accès clinique envoie une photo ou un vocal comme le ferait le propriétaire.
     */
    async simulateOwnerMedia(
      actor: Actor,
      followupId: string,
      media: OwnerMedia,
    ) {
      assertPermission(actor, "clinical.read");
      // Accès vérifié avant de déposer quoi que ce soit.
      await run(actor, async (tx) => {
        const followup = await loadFollowup(tx, actor, followupId);
        if (followup.access !== "clinical") throw new DomainError("not_found");
      });
      return receive(actor.organizationId, followupId, media, (fn) =>
        run(actor, async (tx) => {
          const result = await fn(tx);
          await recordAudit(
            tx,
            actor,
            "simulator.owner_media",
            { type: "followup", id: followupId },
            { kind: media.kind },
          );
          return result;
        }),
      );
    },

    /**
     * Liens de lecture des photos et vocaux d'un dossier, pour la personne qui l'ouvre.
     * Sans accès clinique au dossier : aucun lien (refus, comme si le dossier n'existait pas).
     */
    async readLinks(
      actor: Actor,
      followupId: string,
    ): Promise<Record<string, SignedLink>> {
      assertPermission(actor, "clinical.read");
      const rows = await run(actor, async (tx) => {
        const followup = await loadFollowup(tx, actor, followupId);
        if (followup.access !== "clinical") throw new DomainError("not_found");
        return tx
          .select({ id: attachments.id, key: attachments.storageKey })
          .from(attachments)
          .where(
            and(
              eq(attachments.followupId, followupId),
              inArray(attachments.kind, ["photo", "voice"]),
              isNull(attachments.deletedAt),
            ),
          );
      });
      // Un fichier absent du stockage (données fictives d'exemple) n'a pas de lien.
      const present = await Promise.all(
        rows.map(async (row) =>
          (await storage.hasObject(row.key)) ? row : null,
        ),
      );
      const now = new Date();
      return Object.fromEntries(
        present
          .filter((row) => row !== null)
          .map((row) => [
            row.id,
            signReadLink({
              secret: linkSecret,
              attachmentId: row.id,
              membershipId: actor.membershipId,
              now,
            }),
          ]),
      );
    },

    /**
     * Ouverture d'un lien : signature et expiration pour ce membre, puis droits revérifiés
     * (permission, accès clinique au dossier, fichier non supprimé). Tout refus est un 404.
     */
    async open(
      actor: Actor,
      attachmentId: string,
      link: { expires: string; signature: string },
    ): Promise<StoredObject> {
      if (!z.uuid().safeParse(attachmentId).success)
        throw new DomainError("not_found");
      const valid = verifyReadLink({
        secret: linkSecret,
        attachmentId,
        membershipId: actor.membershipId,
        expires: link.expires,
        signature: link.signature,
      });
      if (!valid) throw new DomainError("not_found");
      assertPermission(actor, "clinical.read");
      const stored = await run(actor, async (tx) => {
        const [row] = await tx
          .select({
            followupId: attachments.followupId,
            kind: attachments.kind,
            storageKey: attachments.storageKey,
            deletedAt: attachments.deletedAt,
          })
          .from(attachments)
          .where(eq(attachments.id, attachmentId));
        if (
          !row?.followupId ||
          row.deletedAt ||
          (row.kind !== "photo" && row.kind !== "voice")
        )
          throw new DomainError("not_found");
        const followup = await loadFollowup(tx, actor, row.followupId);
        if (followup.access !== "clinical") throw new DomainError("not_found");
        await recordAudit(
          tx,
          actor,
          "attachment.opened",
          { type: "followup", id: row.followupId },
          { attachmentId, kind: row.kind },
        );
        return row;
      });
      const object = await storage.getObject(stored.storageKey);
      if (!object) throw new DomainError("not_found");
      return object;
    },
  };
}

const attachmentPayload = z.object({ attachmentId: z.uuid() });

async function loadAttachment(tx: TenantTransaction, payload: unknown) {
  const parsed = attachmentPayload.safeParse(payload);
  if (!parsed.success) throw new JobError("invalid_payload");
  const [row] = await tx
    .select({
      id: attachments.id,
      followupId: attachments.followupId,
      messageId: attachments.messageId,
      kind: attachments.kind,
      storageKey: attachments.storageKey,
      contentType: attachments.contentType,
      retentionUntil: attachments.retentionUntil,
      deletedAt: attachments.deletedAt,
    })
    .from(attachments)
    .where(eq(attachments.id, parsed.data.attachmentId));
  if (!row) throw new JobError("target_missing");
  return row;
}

async function readObject(
  storage: ObjectStorage,
  key: string,
): Promise<StoredObject> {
  const object = await storage.getObject(key);
  if (!object) throw new JobError("target_missing");
  return object;
}

/**
 * Tâches des fichiers : transcription d'un vocal, analyse d'une photo (si activée) et
 * suppression d'un fichier à sa date limite (captures d'agenda : filet de sécurité).
 */
export function mediaHandlers(deps: {
  storage: ObjectStorage;
  ai: AiGateway;
}): Record<string, JobHandler> {
  const { storage, ai } = deps;

  const transcribe: JobHandler = async ({ tx, job }) => {
    const attachment = await loadAttachment(tx, job.payload);
    const { followupId, messageId } = attachment;
    if (attachment.kind !== "voice" || !followupId || !messageId)
      throw new JobError("target_missing");
    if (attachment.deletedAt) return;
    const [done] = await tx
      .select({ id: voiceTranscripts.id })
      .from(voiceTranscripts)
      .where(eq(voiceTranscripts.attachmentId, attachment.id));
    if (done) return;
    const [message] = await tx
      .select({ language: messages.language })
      .from(messages)
      .where(eq(messages.id, messageId));
    const object = await readObject(storage, attachment.storageKey);
    let text: string;
    let language: "fr" | "en";
    try {
      ({ text, language } = await ai.transcribeVoice({
        audio: object.bytes,
        contentType: object.contentType,
        languageHint: message?.language ?? "fr",
      }));
    } catch {
      throw new JobError("provider_unavailable");
    }
    const transcript = text.trim().slice(0, MAX_TRANSCRIPT);
    await tx.insert(voiceTranscripts).values({
      organizationId: job.organizationId,
      followupId,
      attachmentId: attachment.id,
      text: transcript,
      language,
    });
    // La transcription suit le chemin d'un message écrit : accord, triage, réponse.
    try {
      await processInbound(tx, followupId, messageId, transcript);
    } catch (error) {
      if (error instanceof DomainError) throw new JobError("target_missing");
      throw error;
    }
  };

  const observe: JobHandler = async ({ tx, job }) => {
    const attachment = await loadAttachment(tx, job.payload);
    const { followupId, messageId } = attachment;
    if (attachment.kind !== "photo" || !followupId || !messageId)
      throw new JobError("target_missing");
    if (attachment.deletedAt) return;
    const [done] = await tx
      .select({ id: photoObservations.id })
      .from(photoObservations)
      .where(eq(photoObservations.attachmentId, attachment.id));
    if (done) return;
    // Réglage coupé entre-temps, ou pas d'accord du propriétaire : aucune analyse.
    const [settings] = await tx
      .select({ enabled: organizationSettings.photoAnalysisEnabled })
      .from(organizationSettings)
      .where(eq(organizationSettings.organizationId, job.organizationId));
    if (!settings?.enabled) return;
    const [source] = await tx
      .select({ contactId: messages.followupContactId })
      .from(messages)
      .where(eq(messages.id, messageId));
    // L'accord qui compte est celui de la personne qui a envoyé la photo.
    if (
      (await currentConsentState(tx, followupId, source?.contactId)) !== "given"
    )
      return;
    const [context] = await tx
      .select({ animalName: animals.name, language: messages.language })
      .from(messages)
      .innerJoin(followups, eq(followups.id, messages.followupId))
      .innerJoin(animals, eq(animals.id, followups.animalId))
      .where(eq(messages.id, messageId));
    if (!context) throw new JobError("target_missing");
    const object = await readObject(storage, attachment.storageKey);
    let observations: string[];
    try {
      ({ observations } = await ai.observePhoto({
        image: object.bytes,
        contentType: object.contentType,
        language: context.language ?? "fr",
        animalName: context.animalName,
      }));
    } catch {
      throw new JobError("provider_unavailable");
    }
    const kept: string[] = [];
    for (const raw of observations.slice(0, MAX_OBSERVATIONS)) {
      const text = raw.replace(/\s+/g, " ").trim();
      if (!text) continue;
      const verdict = checkNumaReply(text);
      if (verdict.ok && text.length <= MAX_OBSERVATION_LENGTH) kept.push(text);
      else
        // Un diagnostic, un conseil de traitement ou une réassurance n'est jamais gardé.
        await recordAudit(
          tx,
          systemAuthor(job.organizationId),
          "photo.observation_blocked",
          { type: "followup", id: followupId },
          { reason: verdict.ok ? "length" : verdict.reason },
        );
    }
    if (kept.length === 0) return;
    await tx.insert(photoObservations).values({
      organizationId: job.organizationId,
      followupId,
      attachmentId: attachment.id,
      observations: kept.join("\n"),
    });
  };

  const purge: JobHandler = async ({ tx, job }) => {
    const attachment = await loadAttachment(tx, job.payload);
    if (attachment.deletedAt) return;
    await storage.deleteObject(attachment.storageKey);
    await tx
      .update(attachments)
      .set({ deletedAt: new Date() })
      .where(eq(attachments.id, attachment.id));
    await recordAudit(
      tx,
      systemAuthor(job.organizationId),
      "attachment.purged",
      { type: "attachment", id: attachment.id },
      { kind: attachment.kind },
    );
  };

  return {
    [TRANSCRIBE_KIND]: transcribe,
    [OBSERVE_KIND]: observe,
    [PURGE_KIND]: purge,
  };
}
