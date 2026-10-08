import { z } from "zod";

/** Numéro au format international E.164 (« +33612345678 »), comme l'exige WhatsApp. */
export const E164 = /^\+[1-9][0-9]{7,14}$/;

/**
 * Numéro saisi par une personne (« 06 12 34 56 78 », « +33 6 12… », « 0033… ») au format
 * E.164. Un numéro français à 10 chiffres prend l'indicatif +33 ; sinon l'indicatif est exigé.
 */
export function toE164(raw: string): string | null {
  const compact = raw.replace(/[\s.\-()]/g, "");
  const international = compact.startsWith("00")
    ? `+${compact.slice(2)}`
    : /^0[1-9][0-9]{8}$/.test(compact)
      ? `+33${compact.slice(1)}`
      : compact;
  return E164.test(international) ? international : null;
}

/** Numéro masqué pour l'écran : seuls les deux derniers chiffres restent lisibles. */
export function maskPhone(phone: string): string {
  return `•• •• •• •• ${phone.replace(/\D/g, "").slice(-2)}`;
}

/** Numéro d'alerte : vide pour le retirer, sinon un numéro valide. */
export const alertPhoneInput = z
  .string()
  .trim()
  .max(30)
  .transform((value, context) => {
    if (value === "") return null;
    const phone = toE164(value);
    if (!phone) {
      context.addIssue({ code: "custom", message: "phone_invalid" });
      return z.NEVER;
    }
    return phone;
  });
