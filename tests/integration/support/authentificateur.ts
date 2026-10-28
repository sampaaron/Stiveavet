import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  sign,
} from "node:crypto";

import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { isoCBOR } from "@simplewebauthn/server/helpers";

/**
 * Authentificateur logiciel pour les tests : une clé P-256 (ES256), des réponses WebAuthn
 * construites comme le ferait un appareil (attestation « none »). Le serveur les vérifie
 * avec la vraie bibliothèque, sans raccourci.
 */

const sha256 = (data: string | Buffer) =>
  createHash("sha256").update(data).digest();
const b64 = (data: Uint8Array) => Buffer.from(data).toString("base64url");
const u32 = (value: number) => {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value);
  return buffer;
};

// Indicateurs des données d'authentificateur : présence (UP), vérification (UV), clé jointe (AT).
const UP = 0x01;
const UV = 0x04;
const AT = 0x40;

type Options = {
  /** Personne vérifiée sur l'appareil (empreinte, visage, code). Oui par défaut. */
  userVerified?: boolean;
  /** Origine annoncée par le navigateur. Celle de l'application par défaut. */
  origin?: string;
  /** Compteur de signatures imposé (clé copiée). Sinon, il progresse de 1. */
  counter?: number;
};

export function softAuthenticator(appOrigin = "http://localhost:3000") {
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "P-256",
  });
  const jwk = publicKey.export({ format: "jwk" });
  const credentialId = randomBytes(16);
  const id = b64(credentialId);
  let counter = 0;

  const clientData = (type: string, challenge: string, origin: string) =>
    Buffer.from(
      JSON.stringify({ type, challenge, origin, crossOrigin: false }),
      "utf8",
    );

  return {
    id,

    register(
      options: PublicKeyCredentialCreationOptionsJSON,
      { userVerified = true, origin = appOrigin }: Options = {},
    ): RegistrationResponseJSON {
      const cose = isoCBOR.encode(
        new Map<number, number | Uint8Array>([
          [1, 2],
          [3, -7],
          [-1, 1],
          [-2, new Uint8Array(Buffer.from(jwk.x ?? "", "base64url"))],
          [-3, new Uint8Array(Buffer.from(jwk.y ?? "", "base64url"))],
        ]),
      );
      const length = Buffer.alloc(2);
      length.writeUInt16BE(credentialId.length);
      const authData = Buffer.concat([
        sha256(options.rp.id ?? ""),
        Buffer.from([UP | AT | (userVerified ? UV : 0)]),
        u32(counter),
        Buffer.alloc(16),
        length,
        credentialId,
        Buffer.from(cose),
      ]);
      const attestationObject = isoCBOR.encode(
        new Map<string, string | Uint8Array | Map<string, never>>([
          ["fmt", "none"],
          ["attStmt", new Map<string, never>()],
          ["authData", new Uint8Array(authData)],
        ]),
      );
      return {
        id,
        rawId: id,
        type: "public-key",
        clientExtensionResults: {},
        response: {
          clientDataJSON: b64(
            clientData("webauthn.create", options.challenge, origin),
          ),
          attestationObject: b64(attestationObject),
          transports: ["internal"],
        },
      };
    },

    authenticate(
      options: PublicKeyCredentialRequestOptionsJSON,
      {
        userVerified = true,
        origin = appOrigin,
        counter: forced,
      }: Options = {},
    ): AuthenticationResponseJSON {
      counter = forced ?? counter + 1;
      const authData = Buffer.concat([
        sha256(options.rpId ?? ""),
        Buffer.from([UP | (userVerified ? UV : 0)]),
        u32(counter),
      ]);
      const data = clientData("webauthn.get", options.challenge, origin);
      const signature = sign(
        "sha256",
        Buffer.concat([authData, sha256(data)]),
        privateKey,
      );
      return {
        id,
        rawId: id,
        type: "public-key",
        clientExtensionResults: {},
        response: {
          clientDataJSON: b64(data),
          authenticatorData: b64(authData),
          signature: b64(signature),
        },
      };
    },
  };
}
