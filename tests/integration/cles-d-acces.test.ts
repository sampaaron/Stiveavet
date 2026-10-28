import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { MemoryEmailSender } from "@/adapters/email/memory";
import {
  authenticationResponse,
  parseResponse,
  registrationResponse,
} from "@/domains/auth/cles-d-acces";
import { authService } from "@/domains/auth/service";
import type { RequestOrigin } from "@/domains/auth/service";
import { tokenHash } from "@/domains/auth/tokens";

import { asApp, errorCode, pools } from "./support/db";
import { softAuthenticator } from "./support/authentificateur";

/**
 * Clés d'accès (ADR 0050) : une clé, ajoutée mot de passe à l'appui, déverrouille la session
 * de sa titulaire et de personne d'autre. Défi à usage unique, vérification de la personne
 * sur l'appareil, compteur qui progresse, échecs comptés avec ceux du mot de passe.
 */

const { app, admin, appDb } = pools();
afterAll(async () => {
  await app.end();
  await admin.end();
});

const mailbox = new MemoryEmailSender();
const service = authService({
  db: appDb,
  email: mailbox,
  appUrl: "http://localhost:3000",
});
const origin: RequestOrigin = { ip: null, userAgent: "vitest" };
const STRONG = "une phrase de passe solide 42";

/** Nouveau cabinet et son administrateur, connecté. */
async function newAdmin() {
  const email = `cle-${randomUUID().slice(0, 8)}@essai.test`;
  const registered = await service.register(
    {
      organizationName: "Cabinet d'essai",
      displayName: "Dr Essai Clé",
      email,
      plan: "pro",
      acceptTerms: true,
      authorized: true,
      password: STRONG,
    },
    origin,
  );
  if (registered.status !== "code_required") throw new Error("inscription");
  const code = /\b(\d{6})\b/.exec(mailbox.lastTo(email)?.subject ?? "")?.[1];
  const signedIn = await service.verifyCode(
    { challengeToken: registered.challengeToken, code: code ?? "" },
    origin,
  );
  if (signedIn.status !== "signed_in") throw new Error("code");
  return { email, sessionToken: signedIn.sessionToken };
}

/** Ajoute une clé du faux authentificateur à la session (déverrouillée). */
async function addPasskey(
  sessionToken: string,
  device = softAuthenticator(),
  label = "Ordinateur de la consultation",
) {
  const started = await service.passkeyRegistrationOptions(
    { sessionToken, password: STRONG },
    origin,
  );
  if (started.status !== "options") throw new Error(started.status);
  const result = await service.registerPasskey({
    sessionToken,
    label,
    response: device.register(started.options),
  });
  return { device, result };
}

/** Verrouille la session, puis tente de la déverrouiller avec la clé. */
async function unlockWith(
  sessionToken: string,
  device: ReturnType<typeof softAuthenticator>,
  options: Parameters<
    ReturnType<typeof softAuthenticator>["authenticate"]
  >[1] = {},
) {
  await service.lock(sessionToken);
  const challenge = await service.passkeyUnlockOptions(sessionToken);
  if (!challenge) throw new Error("aucun défi");
  return service.unlockWithPasskey(
    { sessionToken, response: device.authenticate(challenge, options) },
    origin,
  );
}

async function loginEvents(email: string, kind: string) {
  const { rows } = await admin.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM login_events e JOIN users u ON u.id = e.user_id
     WHERE u.email = $1 AND e.kind = $2`,
    [email, kind],
  );
  return rows[0]?.n ?? 0;
}

describe("ajout d'une clé d'accès", () => {
  it("exige le mot de passe, vérifie la réponse, prévient par e-mail et journalise", async () => {
    const { email, sessionToken } = await newAdmin();
    expect(
      await service.passkeyRegistrationOptions(
        { sessionToken, password: "mauvais" },
        origin,
      ),
    ).toEqual({ status: "invalid_password" });

    const { device, result } = await addPasskey(sessionToken);
    expect(result).toBe("added");
    expect(mailbox.lastTo(email)?.subject).toBe(
      "Une clé d'accès a été ajoutée à votre compte Stivea Vet",
    );
    const keys = await service.accountPasskeys(sessionToken);
    expect(keys).toEqual([
      expect.objectContaining({
        label: "Ordinateur de la consultation",
        lastUsedAt: null,
      }),
    ]);
    const { rows } = await admin.query(
      `SELECT a.action FROM audit_events a JOIN memberships m ON m.id = a.actor_membership_id
       JOIN users u ON u.id = m.user_id WHERE u.email = $1 AND a.action LIKE 'account.passkey%'`,
      [email],
    );
    expect(rows).toEqual([{ action: "account.passkey_added" }]);

    // La clé publique seule est gardée ; le défi ne sert qu'une fois.
    const { rows: stored } = await admin.query(
      `SELECT p.credential_id, p.transports FROM auth.passkeys p JOIN users u ON u.id = p.user_id
       WHERE u.email = $1`,
      [email],
    );
    expect(stored).toEqual([
      { credential_id: device.id, transports: ["internal"] },
    ]);
  });

  it("refuse une réponse rejouée, une personne non vérifiée ou une autre origine", async () => {
    const { sessionToken } = await newAdmin();
    const options = async () => {
      const started = await service.passkeyRegistrationOptions(
        { sessionToken, password: STRONG },
        origin,
      );
      if (started.status !== "options") throw new Error(started.status);
      return started.options;
    };
    const device = softAuthenticator();
    const register = (response: ReturnType<typeof device.register>) =>
      service.registerPasskey({ sessionToken, label: "Essai", response });

    expect(
      await register(device.register(await options(), { userVerified: false })),
    ).toBe("invalid");
    expect(
      await register(
        device.register(await options(), {
          origin: "https://stivea-vet.example",
        }),
      ),
    ).toBe("invalid");
    const response = device.register(await options());
    expect(await register(response)).toBe("added");
    expect(await register(response)).toBe("invalid");
    expect(await service.accountPasskeys(sessionToken)).toHaveLength(1);
  });

  it("une même clé ne peut appartenir à deux personnes, et 10 clés au plus", async () => {
    const first = await newAdmin();
    const second = await newAdmin();
    const { device } = await addPasskey(first.sessionToken);
    expect((await addPasskey(second.sessionToken, device)).result).toBe(
      "invalid",
    );

    for (let index = 1; index < 10; index += 1)
      expect((await addPasskey(first.sessionToken)).result).toBe("added");
    expect(
      await service.passkeyRegistrationOptions(
        { sessionToken: first.sessionToken, password: STRONG },
        origin,
      ),
    ).toEqual({ status: "limit" });
  });

  it("n'est possible que sur une session déverrouillée", async () => {
    const { sessionToken } = await newAdmin();
    await service.lock(sessionToken);
    expect(
      await service.passkeyRegistrationOptions(
        { sessionToken, password: STRONG },
        origin,
      ),
    ).toEqual({ status: "signed_out" });
  });
});

describe("déverrouillage par clé d'accès", () => {
  it("déverrouille la session verrouillée de sa titulaire, journalisé", async () => {
    const { email, sessionToken } = await newAdmin();
    expect(await service.hasPasskeys(sessionToken)).toBe(false);
    const { device } = await addPasskey(sessionToken);
    expect(await service.hasPasskeys(sessionToken)).toBe(true);
    // Session ouverte : aucun défi de déverrouillage.
    expect(await service.passkeyUnlockOptions(sessionToken)).toBeNull();

    expect(await unlockWith(sessionToken, device)).toBe("unlocked");
    expect((await service.resolveSession(sessionToken))?.locked).toBe(false);
    expect(await loginEvents(email, "session_unlocked_passkey")).toBe(1);
    const [key] = await service.accountPasskeys(sessionToken);
    expect(key?.lastUsedAt).toBeInstanceOf(Date);
    // Le verrouillage à 40 minutes reste : la clé ne fait que le lever.
    expect(await unlockWith(sessionToken, device)).toBe("unlocked");
  });

  it("refuse une réponse rejouée, une clé copiée, une personne non vérifiée ou une autre origine", async () => {
    const { email, sessionToken } = await newAdmin();
    const { device } = await addPasskey(sessionToken);

    await service.lock(sessionToken);
    const challenge = await service.passkeyUnlockOptions(sessionToken);
    if (!challenge) throw new Error("aucun défi");
    const response = device.authenticate(challenge);
    expect(
      await service.unlockWithPasskey({ sessionToken, response }, origin),
    ).toBe("unlocked");
    await service.lock(sessionToken);
    expect(
      await service.unlockWithPasskey({ sessionToken, response }, origin),
    ).toBe("invalid");

    expect(await unlockWith(sessionToken, device, { counter: 1 })).toBe(
      "invalid",
    );
    expect(
      await unlockWith(sessionToken, device, { userVerified: false }),
    ).toBe("invalid");
    expect(
      await unlockWith(sessionToken, device, {
        origin: "https://stivea-vet.example",
      }),
    ).toBe("invalid");
    expect((await service.resolveSession(sessionToken))?.locked).toBe(true);
    expect(await loginEvents(email, "unlock_failed")).toBe(4);
  });

  it("une clé ne déverrouille pas la session d'une autre personne", async () => {
    const owner = await newAdmin();
    const other = await newAdmin();
    const { device } = await addPasskey(owner.sessionToken);
    await addPasskey(other.sessionToken);

    expect(await unlockWith(other.sessionToken, device)).toBe("invalid");
    expect((await service.resolveSession(other.sessionToken))?.locked).toBe(
      true,
    );
    const [key] = await service.accountPasskeys(owner.sessionToken);
    expect(await service.removePasskey(other.sessionToken, key?.id ?? "")).toBe(
      false,
    );
  });

  it("trop d'échecs ferment la session, comme avec le mot de passe", async () => {
    const { sessionToken } = await newAdmin();
    const { device } = await addPasskey(sessionToken);
    for (let attempt = 0; attempt < 5; attempt += 1)
      expect(
        await unlockWith(sessionToken, device, { userVerified: false }),
      ).toBe("invalid");
    expect(await unlockWith(sessionToken, device)).toBe("signed_out");
    expect(await service.resolveSession(sessionToken)).toBeNull();
  });

  it("une clé retirée ne déverrouille plus rien, même avec un défi obtenu avant", async () => {
    const { email, sessionToken } = await newAdmin();
    const { device } = await addPasskey(sessionToken);
    const [key] = await service.accountPasskeys(sessionToken);
    await service.lock(sessionToken);
    const before = await service.passkeyUnlockOptions(sessionToken);
    if (!before) throw new Error("aucun défi");
    expect(
      await service.unlock({ sessionToken, password: STRONG }, origin),
    ).toBe("unlocked");
    expect(await service.removePasskey(sessionToken, key?.id ?? "")).toBe(true);
    expect(await service.removePasskey(sessionToken, key?.id ?? "")).toBe(
      false,
    );
    expect(await service.hasPasskeys(sessionToken)).toBe(false);

    await service.lock(sessionToken);
    expect(await service.passkeyUnlockOptions(sessionToken)).toBeNull();
    expect(
      await service.unlockWithPasskey(
        { sessionToken, response: device.authenticate(before) },
        origin,
      ),
    ).toBe("invalid");
    const { rows } = await admin.query(
      `SELECT a.action FROM audit_events a JOIN memberships m ON m.id = a.actor_membership_id
       JOIN users u ON u.id = m.user_id WHERE u.email = $1 AND a.action = 'account.passkey_removed'`,
      [email],
    );
    expect(rows).toHaveLength(1);
  });
});

describe("réponses du navigateur", () => {
  it("refuse un texte qui n'est pas une réponse WebAuthn bornée", () => {
    const device = softAuthenticator();
    const valid = device.authenticate({ challenge: "a".repeat(43), rpId: "x" });
    expect(
      parseResponse(authenticationResponse, JSON.stringify(valid)),
    ).not.toBeNull();
    for (const raw of [
      "pas du JSON",
      JSON.stringify({ ...valid, type: "password" }),
      JSON.stringify({ ...valid, id: "<script>" }),
      "x".repeat(40_001),
      42,
    ])
      expect(parseResponse(authenticationResponse, raw)).toBeNull();
    // Les transports inconnus sont écartés, pas refusés.
    const registration = device.register({
      challenge: "a".repeat(43),
      rp: { id: "x", name: "x" },
      user: { id: "x", name: "x", displayName: "x" },
      pubKeyCredParams: [],
    });
    const parsed = parseResponse(
      registrationResponse,
      JSON.stringify({
        ...registration,
        response: { ...registration.response, transports: ["internal", "?"] },
      }),
    );
    expect(parsed?.response.transports).toEqual(["internal"]);
  });
});

describe("cloisonnement des clés d'accès", () => {
  it.each(["auth.passkeys", "auth.webauthn_challenges"])(
    "le rôle applicatif ne lit pas %s directement",
    async (table) => {
      const code = await asApp(app, null, (client) =>
        errorCode(client.query(`SELECT 1 FROM ${table} LIMIT 1`)),
      );
      expect(code).toBe("42501");
    },
  );

  it("un jeton de session inconnu n'obtient ni défi ni clé", async () => {
    const unknown = tokenHash("inconnu").toString("base64url").slice(0, 43);
    expect(await service.passkeyUnlockOptions(unknown)).toBeNull();
    expect(await service.accountPasskeys(unknown)).toEqual([]);
    expect(await service.hasPasskeys(unknown)).toBe(false);
  });
});
