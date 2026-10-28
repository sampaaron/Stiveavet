"use server";

import QRCode from "qrcode";
import { z } from "zod";

import { DomainError } from "@/domains/commun/actor";
import { appText } from "@/i18n/app/server";
import { memberContext } from "@/server/authz";
import { services } from "@/server/services";

/**
 * QR code d'accord de l'accueil (ADR 0051). Chaque action refait la garde ; le service vérifie
 * l'accès au dossier, le rôle et que le suivi est encore un brouillon.
 */

const followupId = z.uuid();
const code = z.string().regex(/^ACCORD-[A-Z0-9]{8}$/);

export type OptInQr = {
  contactId: string;
  code: string;
  /** Image SVG en data URL : rien n'est chargé ailleurs. */
  qr: string;
  expiresAt: string;
};

type Failure = { error: string };

/** Refus métier traduit ; toute autre erreur remonte (page d'erreur générique). */
async function failure(error: unknown): Promise<Failure> {
  if (!(error instanceof DomainError)) throw error;
  return { error: (await appText()).t.errors.domain[error.code] };
}

async function invalid(): Promise<Failure> {
  return { error: (await appText()).t.common.invalidRequest };
}

/** Un nouveau code par contact sans accord ; l'ancien ne sert plus. */
export async function issueOptInQrAction(
  id: string,
): Promise<{ codes: OptInQr[] } | Failure> {
  const parsed = followupId.safeParse(id);
  if (!parsed.success) return invalid();
  const context = await memberContext();
  try {
    const codes = await services.optIn().issueCodes(context, parsed.data);
    return {
      codes: await Promise.all(
        codes.map(async (item) => {
          // En simulation, aucun numéro : le QR code porte le texte seul, sans lien.
          const svg = await QRCode.toString(item.link ?? item.message, {
            type: "svg",
            errorCorrectionLevel: "M",
            margin: 1,
          });
          return {
            contactId: item.contactId,
            code: item.code,
            qr: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
            expiresAt: item.expiresAt.toISOString(),
          };
        }),
      ),
    };
  } catch (error) {
    return failure(error);
  }
}

/** Contacts dont l'accord est arrivé, relus toutes les quelques secondes. */
export async function optInStatusAction(
  id: string,
): Promise<{ optedIn: string[] } | Failure> {
  const parsed = followupId.safeParse(id);
  if (!parsed.success) return invalid();
  const context = await memberContext();
  try {
    const { contacts } = await services.optIn().status(context, parsed.data);
    return {
      optedIn: contacts
        .filter((contact) => contact.optedIn)
        .map((contact) => contact.id),
    };
  } catch (error) {
    return failure(error);
  }
}

/** WhatsApp simulé : le téléphone du propriétaire « envoie » le message prêt. */
export async function simulateOptInAction(
  id: string,
  value: string,
): Promise<{ accepted: boolean } | Failure> {
  const parsed = z
    .object({ id: followupId, code })
    .safeParse({ id, code: value });
  if (!parsed.success) return invalid();
  const context = await memberContext();
  try {
    return {
      accepted: await services
        .optIn()
        .simulateScan(context, parsed.data.id, parsed.data.code),
    };
  } catch (error) {
    return failure(error);
  }
}
