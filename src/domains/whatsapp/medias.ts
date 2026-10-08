import { and, eq } from "drizzle-orm";
import { z } from "zod";

import type { ObjectStorage } from "@/adapters/object-storage";
import {
  WhatsAppMediaError,
  WhatsAppSendError,
} from "@/adapters/whatsapp/types";
import type { MediaFailure } from "@/adapters/whatsapp/types";
import { MAX_PHOTO_BYTES, MAX_VOICE_BYTES } from "@/domains/fichiers/media";
import { refuseOwnerMedia, storeOwnerMedia } from "@/domains/fichiers/service";
import type { MediaRefusal } from "@/domains/fichiers/service";
import { JobError } from "@/domains/taches/kinds";
import { enqueue } from "@/domains/taches/queue";
import type { DeadJobHandler, JobHandler } from "@/domains/taches/worker";
import { attachments, messages } from "@/server/db/schema";
import type { TenantTransaction } from "@/server/db/tenant";

import type { WhatsAppProvider } from "./connexion";

/**
 * Photos et vocaux reçus par WhatsApp (lot 22, ADR 0025). Le webhook enregistre le message
 * (avec sa légende) et inscrit cette tâche ; elle télécharge le fichier chez Meta, hors du
 * webhook, qui doit répondre vite. Seul l'identifiant du média chez Meta est dans la tâche.
 * Un fichier trop lourd, d'un type non lu, expiré ou altéré est refusé : trace sans contenu,
 * et Numa demande au propriétaire de le renvoyer ou de décrire la situation.
 */

export const MEDIA_JOB = "whatsapp.media";

const mediaPayload = z.object({
  messageId: z.uuid(),
  mediaId: z.string().regex(/^[0-9]{5,40}$/),
  kind: z.enum(["photo", "voice"]),
});

export async function queueMediaDownload(
  tx: TenantTransaction,
  media: {
    organizationId: string;
    followupId: string;
    messageId: string;
    mediaId: string;
    kind: "photo" | "voice";
  },
) {
  await enqueue(tx, {
    organizationId: media.organizationId,
    kind: MEDIA_JOB,
    idempotencyKey: `whatsapp:media:${media.messageId}`,
    runAt: new Date(),
    followupId: media.followupId,
    payload: {
      messageId: media.messageId,
      mediaId: media.mediaId,
      kind: media.kind,
    },
  });
}

const REFUSALS: Partial<Record<MediaFailure, MediaRefusal>> = {
  too_large: "too_large",
  gone: "expired",
  integrity: "integrity",
};

/** Message reçu auquel rattacher le fichier ; rien si un fichier y est déjà rattaché. */
async function pendingTarget(
  tx: TenantTransaction,
  organizationId: string,
  messageId: string,
) {
  const [message] = await tx
    .select({
      followupId: messages.followupId,
      caption: messages.body,
      attachmentId: attachments.id,
    })
    .from(messages)
    .leftJoin(attachments, eq(attachments.messageId, messages.id))
    .where(and(eq(messages.id, messageId), eq(messages.direction, "inbound")))
    .for("update", { of: messages });
  if (!message) throw new JobError("target_missing");
  if (message.attachmentId) return null;
  return {
    organizationId,
    followupId: message.followupId,
    messageId,
    caption: message.caption,
  };
}

export function mediaDownloadHandlers(deps: {
  whatsapp: WhatsAppProvider;
  storage: ObjectStorage;
}): {
  handlers: Record<string, JobHandler>;
  dead: Record<string, DeadJobHandler>;
} {
  const download: JobHandler = async ({ tx, job }) => {
    const parsed = mediaPayload.safeParse(job.payload);
    if (!parsed.success) throw new JobError("invalid_payload");
    const { messageId, mediaId, kind } = parsed.data;
    const target = await pendingTarget(tx, job.organizationId, messageId);
    if (!target) return;
    let bytes: Uint8Array;
    try {
      const connector = await deps.whatsapp.connectorFor(tx);
      bytes = await connector.downloadMedia({
        mediaId,
        maxBytes: kind === "photo" ? MAX_PHOTO_BYTES : MAX_VOICE_BYTES,
      });
    } catch (error) {
      if (error instanceof WhatsAppSendError && error.failure === "account")
        throw new JobError("provider_account", { final: true });
      if (!(error instanceof WhatsAppMediaError))
        throw new JobError("provider_unavailable");
      if (error.failure === "account")
        throw new JobError("provider_account", { final: true });
      const reason = REFUSALS[error.failure];
      if (!reason) throw new JobError("provider_unavailable");
      await refuseOwnerMedia(tx, target, { kind, reason });
      return;
    }
    const refusal = await storeOwnerMedia(tx, deps.storage, target, {
      kind,
      bytes,
    });
    if (refusal) await refuseOwnerMedia(tx, target, { kind, reason: refusal });
  };

  /** Téléchargement abandonné (Meta indisponible, compte à reconnecter) : fichier refusé. */
  const downloadDead: DeadJobHandler = async ({ tx, job }) => {
    const parsed = mediaPayload.safeParse(job.payload);
    if (!parsed.success) return;
    const target = await pendingTarget(
      tx,
      job.organizationId,
      parsed.data.messageId,
    );
    if (target)
      await refuseOwnerMedia(tx, target, {
        kind: parsed.data.kind,
        reason: "unavailable",
      });
  };

  return {
    handlers: { [MEDIA_JOB]: download },
    dead: { [MEDIA_JOB]: downloadDead },
  };
}
