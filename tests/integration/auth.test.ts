import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { FICTIONAL_LOGIN_PHRASE } from "../../db/seed/cabinets-fictifs";
import { MemoryEmailSender } from "@/adapters/email/memory";
import { authService } from "@/domains/auth/service";
import type { RequestOrigin } from "@/domains/auth/service";
import { tokenHash } from "@/domains/auth/tokens";

import { asApp, errorCode, pools } from "./support/db";

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

function codeSentTo(address: string): string {
  const message = mailbox.lastTo(address);
  const code = /\b(\d{6})\b/.exec(message?.subject ?? "")?.[1];
  if (!code) throw new Error(`Aucun code envoyé à ${address}`);
  return code;
}

function resetLinkSentTo(address: string): string {
  const message = mailbox.lastTo(address);
  const link = /(http\S+jeton=[\w-]+)/.exec(message?.text ?? "")?.[1];
  if (!link) throw new Error(`Aucun lien envoyé à ${address}`);
  return new URL(link).searchParams.get("jeton") ?? "";
}

/** Nouveau cabinet et son administrateur, connecté (session + appareil de confiance). */
async function newAdmin() {
  const email = `admin-${randomUUID().slice(0, 8)}@essai.test`;
  const registered = await service.register(
    {
      organizationName: "Cabinet d'essai",
      displayName: "Dr Essai Test",
      email,
      plan: "clinic",
      password: STRONG,
    },
    origin,
  );
  if (registered.status !== "code_required") throw new Error("inscription");
  const signedIn = await service.verifyCode(
    { challengeToken: registered.challengeToken, code: codeSentTo(email) },
    origin,
  );
  if (signedIn.status !== "signed_in") throw new Error("code");
  return { email, ...signedIn };
}

async function sessionRow(sessionToken: string) {
  const { rows } = await admin.query(
    "SELECT * FROM auth.sessions WHERE token_hash = $1",
    [tokenHash(sessionToken)],
  );
  return rows[0] as Record<string, unknown> | undefined;
}

describe("connexion", () => {
  it("un vétérinaire sur un appareil inconnu doit saisir un code e-mail, à usage unique", async () => {
    const email = "hugo.marchal@tilleuls.test";
    const first = await service.login(
      { email, password: FICTIONAL_LOGIN_PHRASE },
      origin,
    );
    expect(first.status).toBe("code_required");
    if (first.status !== "code_required") return;
    const code = codeSentTo(email);

    const wrong = await service.verifyCode(
      {
        challengeToken: first.challengeToken,
        code: code === "000000" ? "111111" : "000000",
      },
      origin,
    );
    expect(wrong.status).toBe("invalid");

    const ok = await service.verifyCode(
      { challengeToken: first.challengeToken, code },
      origin,
    );
    expect(ok.status).toBe("signed_in");
    if (ok.status !== "signed_in") return;
    expect(ok.deviceToken).toBeDefined();

    const reused = await service.verifyCode(
      { challengeToken: first.challengeToken, code },
      origin,
    );
    expect(reused.status).toBe("expired");

    // Appareil désormais reconnu : plus de code.
    const second = await service.login(
      { email, password: FICTIONAL_LOGIN_PHRASE, deviceToken: ok.deviceToken },
      origin,
    );
    expect(second.status).toBe("signed_in");
  });

  it("un appareil reconnu pour une personne ne l'est pas pour une autre", async () => {
    const first = await newAdmin();
    const other = await newAdmin();
    const attempt = await service.login(
      { email: other.email, password: STRONG, deviceToken: first.deviceToken },
      origin,
    );
    expect(attempt.status).toBe("code_required");
  });

  it("un assistant se connecte par mot de passe seul", async () => {
    const result = await service.login(
      { email: "lea.roux@tilleuls.test", password: FICTIONAL_LOGIN_PHRASE },
      origin,
    );
    expect(result.status).toBe("signed_in");
  });

  it("mauvais mot de passe et adresse inconnue reçoivent la même réponse", async () => {
    const wrongPassword = await service.login(
      {
        email: "ines.benali@tilleuls.test",
        password: "pas le bon mot de passe",
      },
      origin,
    );
    const unknown = await service.login(
      { email: "personne@inconnu.test", password: "pas le bon mot de passe" },
      origin,
    );
    expect(wrongPassword).toEqual({ status: "invalid" });
    expect(unknown).toEqual({ status: "invalid" });
  });

  it("bloque le compte après 5 échecs, même avec le bon mot de passe ensuite", async () => {
    const { email } = await newAdmin();
    for (let attempt = 0; attempt < 5; attempt += 1)
      expect(
        (await service.login({ email, password: "mauvais essai" }, origin))
          .status,
      ).toBe("invalid");
    const blocked = await service.login({ email, password: STRONG }, origin);
    expect(blocked.status).toBe("rate_limited");
  });

  it("limite les tentatives par adresse IP quand elle est connue", async () => {
    const ip = { ip: "203.0.113.77", userAgent: "vitest" };
    const results: string[] = [];
    for (let attempt = 0; attempt < 31; attempt += 1)
      results.push(
        (
          await service.login(
            { email: `inconnu-${attempt}@essai.test`, password: "x" },
            ip,
          )
        ).status,
      );
    expect(results.slice(0, 30).every((status) => status === "invalid")).toBe(
      true,
    );
    expect(results[30]).toBe("rate_limited");
  });

  it("un code est refusé après 5 essais ou après expiration", async () => {
    const { email } = await newAdmin();
    const tooMany = await service.login({ email, password: STRONG }, origin);
    if (tooMany.status !== "code_required") throw new Error("code attendu");
    const code = codeSentTo(email);
    for (let attempt = 0; attempt < 5; attempt += 1)
      await service.verifyCode(
        {
          challengeToken: tooMany.challengeToken,
          code: code === "000000" ? "999999" : "000000",
        },
        origin,
      );
    expect(
      (
        await service.verifyCode(
          { challengeToken: tooMany.challengeToken, code },
          origin,
        )
      ).status,
    ).toBe("expired");

    const late = await service.login({ email, password: STRONG }, origin);
    if (late.status !== "code_required") throw new Error("code attendu");
    await admin.query(
      "UPDATE auth.login_challenges SET expires_at = now() - interval '1 second' WHERE token_hash = $1",
      [tokenHash(late.challengeToken)],
    );
    expect(
      (
        await service.verifyCode(
          { challengeToken: late.challengeToken, code: codeSentTo(email) },
          origin,
        )
      ).status,
    ).toBe("expired");
  });

  it("un nouveau code annule le précédent", async () => {
    const { email } = await newAdmin();
    const first = await service.login({ email, password: STRONG }, origin);
    if (first.status !== "code_required") throw new Error("code attendu");
    const firstCode = codeSentTo(email);
    await service.login({ email, password: STRONG }, origin);
    expect(
      (
        await service.verifyCode(
          { challengeToken: first.challengeToken, code: firstCode },
          origin,
        )
      ).status,
    ).toBe("expired");
  });
});

describe("session et verrouillage", () => {
  it("se verrouille côté serveur après 40 minutes sans activité, pas avant", async () => {
    const { sessionToken } = await newAdmin();
    const hash = tokenHash(sessionToken);

    await admin.query(
      "UPDATE auth.sessions SET last_activity_at = now() - interval '39 minutes' WHERE token_hash = $1",
      [hash],
    );
    expect((await service.resolveSession(sessionToken))?.locked).toBe(false);

    await admin.query(
      "UPDATE auth.sessions SET last_activity_at = now() - interval '41 minutes' WHERE token_hash = $1",
      [hash],
    );
    expect((await service.resolveSession(sessionToken))?.locked).toBe(true);
    // Une requête sur une session verrouillée ne la prolonge pas et ne la déverrouille pas.
    expect((await service.resolveSession(sessionToken))?.locked).toBe(true);

    expect(
      await service.unlock({ sessionToken, password: "mauvais" }, origin),
    ).toBe("invalid");
    expect(
      await service.unlock({ sessionToken, password: STRONG }, origin),
    ).toBe("unlocked");
    expect((await service.resolveSession(sessionToken))?.locked).toBe(false);
  });

  it("trop d'échecs de déverrouillage ferment la session", async () => {
    const { sessionToken } = await newAdmin();
    await service.lock(sessionToken);
    for (let attempt = 0; attempt < 5; attempt += 1)
      expect(
        await service.unlock({ sessionToken, password: "mauvais" }, origin),
      ).toBe("invalid");
    expect(
      await service.unlock({ sessionToken, password: STRONG }, origin),
    ).toBe("signed_out");
    expect(await service.resolveSession(sessionToken)).toBeNull();
  });

  it("expire après 12 heures et se ferme à la déconnexion", async () => {
    const first = await newAdmin();
    await admin.query(
      "UPDATE auth.sessions SET expires_at = now() - interval '1 second' WHERE token_hash = $1",
      [tokenHash(first.sessionToken)],
    );
    expect(await service.resolveSession(first.sessionToken)).toBeNull();

    const second = await newAdmin();
    await service.logout(second.sessionToken);
    expect(await service.resolveSession(second.sessionToken)).toBeNull();
  });

  it("un compte désactivé ou retiré du cabinet est déconnecté immédiatement", async () => {
    const disabled = await newAdmin();
    const session = await service.resolveSession(disabled.sessionToken);
    await admin.query("UPDATE users SET disabled_at = now() WHERE id = $1", [
      session?.userId,
    ]);
    expect(await service.resolveSession(disabled.sessionToken)).toBeNull();
    expect(
      (await service.login({ email: disabled.email, password: STRONG }, origin))
        .status,
    ).toBe("invalid");

    // Retrait d'un vétérinaire du cabinet (le dernier administrateur ne peut pas l'être).
    const ines = "ines.benali@tilleuls.test";
    const challenge = await service.login(
      { email: ines, password: FICTIONAL_LOGIN_PHRASE },
      origin,
    );
    if (challenge.status !== "code_required") throw new Error("code attendu");
    const removed = await service.verifyCode(
      { challengeToken: challenge.challengeToken, code: codeSentTo(ines) },
      origin,
    );
    if (removed.status !== "signed_in") throw new Error("session attendue");
    const removedSession = await service.resolveSession(removed.sessionToken);
    await admin.query(
      "UPDATE memberships SET deactivated_at = now() WHERE id = $1",
      [removedSession?.membershipId],
    );
    expect(await service.resolveSession(removed.sessionToken)).toBeNull();
    expect((await sessionRow(removed.sessionToken))?.revoked_at).not.toBeNull();
    await admin.query(
      "UPDATE memberships SET deactivated_at = NULL WHERE id = $1",
      [removedSession?.membershipId],
    );
  });

  it("refuse un jeton mal formé sans interroger la base", async () => {
    expect(await service.resolveSession("x' OR 1=1 --")).toBeNull();
    expect(await service.resolveSession(undefined)).toBeNull();
  });
});

describe("réinitialisation du mot de passe", () => {
  it("lien à usage unique, sessions fermées, ancien mot de passe refusé", async () => {
    const account = await newAdmin();
    expect(
      await service.requestPasswordReset({ email: account.email }, origin),
    ).toBe("sent");
    const token = resetLinkSentTo(account.email);
    expect(await service.passwordResetValid(token)).toBe(true);

    const newPassword = "un tout nouveau mot de passe 7";
    expect(
      (await service.resetPassword({ token, password: newPassword }, origin))
        .status,
    ).toBe("done");
    expect(mailbox.lastTo(account.email)?.subject).toMatch(/modifié/);
    expect(
      (await service.resetPassword({ token, password: newPassword }, origin))
        .status,
    ).toBe("expired");
    expect(await service.resolveSession(account.sessionToken)).toBeNull();

    expect(
      (await service.login({ email: account.email, password: STRONG }, origin))
        .status,
    ).toBe("invalid");
    expect(
      (
        await service.login(
          {
            email: account.email,
            password: newPassword,
            deviceToken: account.deviceToken,
          },
          origin,
        )
      ).status,
    ).toBe("signed_in");
  });

  it("lien expiré refusé ; mot de passe faible refusé sans consommer le lien", async () => {
    const account = await newAdmin();
    await service.requestPasswordReset({ email: account.email }, origin);
    const token = resetLinkSentTo(account.email);

    const weak = await service.resetPassword(
      { token, password: "azerty2024!" },
      origin,
    );
    expect(weak.status).toBe("invalid_password");
    expect(await service.passwordResetValid(token)).toBe(true);

    await admin.query(
      "UPDATE auth.password_resets SET expires_at = now() - interval '1 second' WHERE token_hash = $1",
      [tokenHash(token)],
    );
    expect(
      (
        await service.resetPassword(
          { token, password: "encore une phrase valable 9" },
          origin,
        )
      ).status,
    ).toBe("expired");
  });

  it("adresse inconnue : même réponse, aucun e-mail", async () => {
    const before = mailbox.sent.length;
    expect(
      await service.requestPasswordReset(
        { email: "absent@inconnu.test" },
        origin,
      ),
    ).toBe("sent");
    expect(mailbox.sent.length).toBe(before);
  });
});

describe("inscription", () => {
  it("crée le cabinet, l'administrateur et l'audit ; la session attend le code", async () => {
    const { sessionToken } = await newAdmin();
    const session = await service.resolveSession(sessionToken);
    expect(session?.role).toBe("admin_vet");

    const actions = await asApp(
      app,
      session?.organizationId ?? null,
      async (client) => {
        const { rows } = await client.query(
          "SELECT action FROM audit_events ORDER BY action",
        );
        return rows.map((row: { action: string }) => row.action);
      },
    );
    expect(actions).toEqual(["membership.created", "organization.created"]);
  });

  it("adresse déjà enregistrée : même écran, e-mail d'information, aucun cabinet créé", async () => {
    const email = "claire.fontaine@tilleuls.test";
    const { rows: before } = await admin.query(
      "SELECT count(*)::int AS n FROM organizations",
    );
    const result = await service.register(
      {
        organizationName: "Cabinet usurpé",
        displayName: "Dr Usurpateur",
        email,
        plan: "clinic",
        password: STRONG,
      },
      origin,
    );
    expect(result.status).toBe("code_required");
    expect(mailbox.lastTo(email)?.subject).toMatch(/existe déjà/);
    const { rows: after } = await admin.query(
      "SELECT count(*)::int AS n FROM organizations",
    );
    expect(after[0]).toEqual(before[0]);
    if (result.status !== "code_required") return;
    expect(
      (
        await service.verifyCode(
          { challengeToken: result.challengeToken, code: "123456" },
          origin,
        )
      ).status,
    ).toBe("expired");
  });

  it("refuse un mot de passe courant ou contenant le nom", async () => {
    const result = await service.register(
      {
        organizationName: "Cabinet",
        displayName: "Dr Bertrand Lemoine",
        email: "bertrand@essai.test",
        plan: "clinic",
        password: "Bertrand-cabinet-2026",
      },
      origin,
    );
    expect(result.status).toBe("invalid_password");
  });
});

describe("cloisonnement du schéma auth", () => {
  it.each([
    "auth.credentials",
    "auth.sessions",
    "auth.login_challenges",
    "auth.password_resets",
    "auth.trusted_devices",
    "auth.rate_limits",
  ])("le rôle applicatif ne lit pas %s directement", async (table) => {
    const code = await asApp(app, null, (client) =>
      errorCode(client.query(`SELECT 1 FROM ${table} LIMIT 1`)),
    );
    expect(code).toBe("42501");
  });

  it("le rôle applicatif ne peut ni écrire ni modifier le journal de connexion", async () => {
    const insert = await asApp(app, null, (client) =>
      errorCode(
        client.query("INSERT INTO login_events (kind) VALUES ('logout')"),
      ),
    );
    expect(insert).toBe("42501");
  });

  it("ne stocke ni jeton, ni code, ni mot de passe en clair", async () => {
    const { sessionToken, email } = await newAdmin();
    const row = await sessionRow(sessionToken);
    expect(
      Buffer.from(row?.token_hash as Buffer).toString("utf8"),
    ).not.toContain(sessionToken);
    const { rows } = await admin.query(
      "SELECT c.password_hash FROM auth.credentials c JOIN users u ON u.id = c.user_id WHERE u.email = $1",
      [email],
    );
    expect(rows[0]?.password_hash).toMatch(/^\$argon2id\$/);
  });

  it("le journal de connexion n'est visible que du cabinet concerné", async () => {
    const { sessionToken } = await newAdmin();
    const session = await service.resolveSession(sessionToken);
    const own = await asApp(
      app,
      session?.organizationId ?? null,
      async (client) => {
        const { rows } = await client.query(
          "SELECT DISTINCT organization_id FROM login_events",
        );
        return rows.map(
          (row: { organization_id: string }) => row.organization_id,
        );
      },
    );
    expect(own).toEqual([session?.organizationId]);
  });
});
