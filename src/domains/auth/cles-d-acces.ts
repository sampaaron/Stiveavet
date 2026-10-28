import { z } from "zod";

/**
 * Clés d'accès (WebAuthn, ADR 0050) : reprendre une session verrouillée par l'empreinte, le
 * visage ou le code de l'appareil, sans retaper le mot de passe. Une clé ne sert qu'à
 * déverrouiller : la connexion garde mot de passe et code de sécurité.
 */

export const PASSKEY_POLICY = {
  /** Clés actives par personne. */
  maxPerUser: 10,
  /** Durée d'un défi : le temps de toucher le capteur. */
  challengeMinutes: 5,
  labelMaxLength: 60,
} as const;

/** Site auquel les clés sont attachées : celui de APP_URL, et lui seul. */
export function relyingParty(appUrl: string) {
  const url = new URL(appUrl);
  return { id: url.hostname, origin: url.origin, name: "Stivea Vet" };
}

const base64url = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .regex(/^[A-Za-z0-9_-]+$/);

const TRANSPORTS = [
  "ble",
  "cable",
  "hybrid",
  "internal",
  "nfc",
  "smart-card",
  "usb",
] as const;

// Réponses du navigateur, telles que les renvoie @simplewebauthn/browser. Les extensions ne
// servent pas : elles sont écartées.
const credentialFields = {
  id: base64url(1366),
  rawId: base64url(1366),
  authenticatorAttachment: z.enum(["platform", "cross-platform"]).optional(),
  clientExtensionResults: z.object({}),
  type: z.literal("public-key"),
};

export const registrationResponse = z.object({
  ...credentialFields,
  response: z.object({
    clientDataJSON: base64url(4096),
    attestationObject: base64url(16_384),
    authenticatorData: base64url(16_384).optional(),
    // Un transport inconnu est ignoré, pas refusé : les navigateurs en ajoutent.
    transports: z
      .array(z.string().max(32))
      .max(10)
      .optional()
      .transform((values) =>
        values?.filter((value): value is (typeof TRANSPORTS)[number] =>
          (TRANSPORTS as readonly string[]).includes(value),
        ),
      ),
    publicKeyAlgorithm: z.number().int().optional(),
    publicKey: base64url(4096).optional(),
  }),
});

export const authenticationResponse = z.object({
  ...credentialFields,
  response: z.object({
    clientDataJSON: base64url(4096),
    authenticatorData: base64url(4096),
    signature: base64url(1024),
    userHandle: base64url(1024).optional(),
  }),
});

/** Nom donné à la clé (« MacBook du bureau ») : un nom court, pas un message. */
export const passkeyLabel = z
  .string()
  .trim()
  .min(1, "passkey_label_required")
  .max(PASSKEY_POLICY.labelMaxLength, "passkey_label_long")
  .regex(/^[^\p{C}<>]*$/u, "passkey_label_chars");

/** Réponse reçue en texte (action serveur) : JSON borné, puis forme vérifiée. */
export function parseResponse<T>(schema: z.ZodType<T>, raw: unknown): T | null {
  if (typeof raw !== "string" || raw.length > 40_000) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
