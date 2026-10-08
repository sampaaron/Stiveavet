import { DEFAULT_LOCALE } from "@/i18n/locales";
import type { Locale } from "@/i18n/locales";
import { randomUUID } from "node:crypto";

import type { EmailSender } from "@/adapters/email/types";
import {
  auditEvents,
  memberships,
  organizations,
  users,
} from "@/server/db/schema";
import { startSubscription } from "@/domains/facturation/service";
import type { Plan } from "@/domains/facturation/rules";
import { withTenant } from "@/server/db/tenant";
import type { Database } from "@/server/db/tenant";
import { sql } from "drizzle-orm";

import {
  existingAccountEmail,
  passwordChangedEmail,
  passwordResetEmail,
  securityCodeEmail,
} from "./emails";
import { hashPassword, passwordProblems, verifyPassword } from "./password";
import type { PasswordProblem } from "./password";
import { AUTH_POLICY, RATE_LIMITS, TERMS_VERSION } from "./policy";
import type { RateLimitName } from "./policy";
import { authRepository } from "./repository";
import type { MemberRole, ResolvedSession } from "./repository";
import {
  createSecurityCode,
  createToken,
  ipFingerprint,
  isWellFormedToken,
  rateLimitBucket,
  securityCodeHash,
  tokenHash,
} from "./tokens";

/** Origine de la requête : l'IP n'est connue que derrière un proxy de confiance. */
export type RequestOrigin = { ip: string | null; userAgent: string | null };

export type AuthDependencies = {
  db: Database;
  email: EmailSender;
  appUrl: string;
};

export type SignedIn = {
  status: "signed_in";
  sessionToken: string;
  sessionExpiresAt: Date;
  /** Nouveau jeton d'appareil de confiance, à poser en cookie (après un code valide). */
  deviceToken?: string;
};

export type LoginResult =
  | SignedIn
  | { status: "code_required"; challengeToken: string }
  | { status: "invalid" }
  | { status: "rate_limited" };

export type CodeResult =
  SignedIn | { status: "invalid" } | { status: "expired" };

export type RegisterResult =
  | { status: "code_required"; challengeToken: string }
  | { status: "invalid_password"; problems: PasswordProblem[] }
  | { status: "rate_limited" };

const VET_ROLES: ReadonlySet<MemberRole> = new Set(["admin_vet", "vet"]);

export function authService({ db, email, appUrl }: AuthDependencies) {
  const repo = authRepository(db);

  /** Compte une tentative et indique si elle reste dans la limite. Sans sujet connu, pas de compteur. */
  async function allowed(name: RateLimitName, subject: string | null) {
    if (subject === null) return true;
    const [max, windowMinutes] = RATE_LIMITS[name];
    return repo.hitRateLimit(
      rateLimitBucket(name, subject),
      windowMinutes,
      max,
    );
  }

  /** Limite atteinte, sans compter de tentative : seuls les échecs sont comptés ensuite. */
  async function blocked(name: RateLimitName, subject: string) {
    const [max, windowMinutes] = RATE_LIMITS[name];
    return repo.rateLimitReached(
      rateLimitBucket(name, subject),
      windowMinutes,
      max,
    );
  }

  function eventOrigin(origin: RequestOrigin) {
    return { ipHash: ipFingerprint(origin.ip), userAgent: origin.userAgent };
  }

  async function openSession(
    userId: string,
    membershipId: string,
  ): Promise<SignedIn> {
    const sessionToken = createToken();
    const lifetimeMinutes = AUTH_POLICY.sessionHours * 60;
    await repo.createSession(
      tokenHash(sessionToken),
      userId,
      membershipId,
      lifetimeMinutes,
    );
    return {
      status: "signed_in",
      sessionToken,
      sessionExpiresAt: new Date(Date.now() + lifetimeMinutes * 60_000),
    };
  }

  async function sendSecurityCode(userId: string, to: string) {
    const challengeToken = createToken();
    const code = createSecurityCode();
    await repo.createLoginChallenge(
      tokenHash(challengeToken),
      userId,
      securityCodeHash(challengeToken, code),
      AUTH_POLICY.codeMinutes,
    );
    await email.send(securityCodeEmail(to, code));
    return challengeToken;
  }

  return {
    /** Mot de passe ; puis code e-mail si un vétérinaire se connecte depuis un appareil inconnu. */
    async login(
      input: { email: string; password: string; deviceToken?: string },
      origin: RequestOrigin,
    ): Promise<LoginResult> {
      const address = input.email.trim().toLowerCase();
      const ipAllowed = await allowed("loginPerIp", origin.ip);
      if (!ipAllowed || (await blocked("loginFailuresPerAccount", address))) {
        await repo.recordLoginEvent({
          kind: "login_rate_limited",
          ...eventOrigin(origin),
        });
        return { status: "rate_limited" };
      }

      const credentials = await repo.credentialsByEmail(address);
      const passwordOk = await verifyPassword(
        credentials?.passwordHash ?? null,
        input.password,
      );
      const memberships =
        credentials && passwordOk
          ? await repo.activeMemberships(credentials.userId)
          : [];
      const membership = memberships[0];
      if (!credentials || !passwordOk || !membership) {
        await allowed("loginFailuresPerAccount", address);
        await repo.recordLoginEvent({
          kind: "login_failed",
          userId: credentials?.userId,
          ...eventOrigin(origin),
        });
        return { status: "invalid" };
      }

      const needsCode = memberships.some((m) => VET_ROLES.has(m.role));
      const trusted =
        needsCode && isWellFormedToken(input.deviceToken)
          ? await repo.isTrustedDevice(
              tokenHash(input.deviceToken),
              credentials.userId,
            )
          : false;
      if (needsCode && !trusted) {
        const challengeToken = await sendSecurityCode(
          credentials.userId,
          address,
        );
        await repo.recordLoginEvent({
          kind: "code_sent",
          userId: credentials.userId,
          organizationId: membership.organizationId,
          ...eventOrigin(origin),
        });
        return { status: "code_required", challengeToken };
      }

      const signedIn = await openSession(
        credentials.userId,
        membership.membershipId,
      );
      await repo.recordLoginEvent({
        kind: "login_succeeded",
        userId: credentials.userId,
        organizationId: membership.organizationId,
        ...eventOrigin(origin),
      });
      return signedIn;
    },

    /** Code à usage unique ; un code valide ouvre la session et reconnaît l'appareil. */
    async verifyCode(
      input: { challengeToken: string | undefined; code: string },
      origin: RequestOrigin,
    ): Promise<CodeResult> {
      if (!isWellFormedToken(input.challengeToken))
        return { status: "expired" };
      const code = input.code.replace(/\s/g, "");
      if (!/^\d{6}$/.test(code)) return { status: "invalid" };

      const { outcome, userId } = await repo.verifyLoginChallenge(
        tokenHash(input.challengeToken),
        securityCodeHash(input.challengeToken, code),
        AUTH_POLICY.codeMaxAttempts,
      );
      if (outcome !== "ok" || !userId) {
        if (userId)
          await repo.recordLoginEvent({
            kind: "code_failed",
            userId,
            ...eventOrigin(origin),
          });
        return { status: outcome === "invalid" ? "invalid" : "expired" };
      }

      const [membership] = await repo.activeMemberships(userId);
      if (!membership) return { status: "expired" };
      const signedIn = await openSession(userId, membership.membershipId);
      const deviceToken = createToken();
      await repo.trustDevice(
        tokenHash(deviceToken),
        userId,
        AUTH_POLICY.trustedDeviceDays,
      );
      await repo.recordLoginEvent({
        kind: "login_succeeded",
        userId,
        organizationId: membership.organizationId,
        ...eventOrigin(origin),
      });
      return { ...signedIn, deviceToken };
    },

    /** Session du jeton, après contrôle de l'inactivité (verrouillage à 40 min). */
    async resolveSession(
      sessionToken: string | undefined,
    ): Promise<ResolvedSession | null> {
      if (!isWellFormedToken(sessionToken)) return null;
      return repo.resolveSession(
        tokenHash(sessionToken),
        AUTH_POLICY.idleLockMinutes,
      );
    },

    async lock(sessionToken: string | undefined) {
      if (!isWellFormedToken(sessionToken)) return;
      const session = await repo.resolveSession(
        tokenHash(sessionToken),
        AUTH_POLICY.idleLockMinutes,
      );
      if (!session || session.locked) return;
      await repo.lockSession(tokenHash(sessionToken));
      await repo.recordLoginEvent({
        kind: "session_locked",
        userId: session.userId,
        organizationId: session.organizationId,
      });
    },

    /**
     * Déverrouillage par mot de passe. Trop d'échecs ferment la session : il faut alors
     * se reconnecter entièrement (et repasser le code pour un vétérinaire sur appareil inconnu).
     */
    async unlock(
      input: { sessionToken: string | undefined; password: string },
      origin: RequestOrigin,
    ): Promise<"unlocked" | "invalid" | "signed_out"> {
      const session = await this.resolveSession(input.sessionToken);
      if (!session || !input.sessionToken) return "signed_out";
      const hash = tokenHash(input.sessionToken);
      if (!session.locked) return "unlocked";

      if (await blocked("unlockFailuresPerAccount", session.userId)) {
        await repo.revokeSession(hash);
        await repo.recordLoginEvent({
          kind: "login_rate_limited",
          userId: session.userId,
          organizationId: session.organizationId,
          ...eventOrigin(origin),
        });
        return "signed_out";
      }
      const ok = await verifyPassword(
        await repo.passwordHashFor(session.userId),
        input.password,
      );
      await repo.recordLoginEvent({
        kind: ok ? "session_unlocked" : "unlock_failed",
        userId: session.userId,
        organizationId: session.organizationId,
        ...eventOrigin(origin),
      });
      if (!ok) {
        await allowed("unlockFailuresPerAccount", session.userId);
        return "invalid";
      }
      await repo.unlockSession(hash);
      return "unlocked";
    },

    async logout(sessionToken: string | undefined) {
      if (!isWellFormedToken(sessionToken)) return;
      const session = await repo.resolveSession(
        tokenHash(sessionToken),
        AUTH_POLICY.idleLockMinutes,
      );
      await repo.revokeSession(tokenHash(sessionToken));
      if (session)
        await repo.recordLoginEvent({
          kind: "logout",
          userId: session.userId,
          organizationId: session.organizationId,
        });
    },

    /** Réponse identique que le compte existe ou non. */
    async requestPasswordReset(
      input: { email: string },
      origin: RequestOrigin,
    ): Promise<"sent" | "rate_limited"> {
      const address = input.email.trim().toLowerCase();
      const ipAllowed = await allowed("resetPerIp", origin.ip);
      const accountAllowed = await allowed("resetPerAccount", address);
      if (!ipAllowed || !accountAllowed) return "rate_limited";

      const credentials = await repo.credentialsByEmail(address);
      if (credentials) {
        const token = createToken();
        await repo.createPasswordReset(
          tokenHash(token),
          credentials.userId,
          AUTH_POLICY.resetMinutes,
        );
        const url = new URL("/mot-de-passe/nouveau", appUrl);
        url.searchParams.set("jeton", token);
        await email.send(passwordResetEmail(address, url.toString()));
        await repo.recordLoginEvent({
          kind: "password_reset_requested",
          userId: credentials.userId,
          ...eventOrigin(origin),
        });
      }
      return "sent";
    },

    async passwordResetValid(token: string | undefined) {
      return isWellFormedToken(token)
        ? repo.passwordResetValid(tokenHash(token))
        : false;
    },

    async resetPassword(
      input: { token: string | undefined; password: string },
      origin: RequestOrigin,
    ): Promise<
      | { status: "done" }
      | { status: "expired" }
      | { status: "invalid_password"; problems: PasswordProblem[] }
    > {
      if (!isWellFormedToken(input.token)) return { status: "expired" };
      const problems = passwordProblems(input.password);
      if (problems.length) return { status: "invalid_password", problems };

      const result = await repo.resetPassword(
        tokenHash(input.token),
        await hashPassword(input.password),
      );
      if (!result) return { status: "expired" };
      await email.send(passwordChangedEmail(result.email));
      await repo.recordLoginEvent({
        kind: "password_reset_completed",
        userId: result.userId,
        ...eventOrigin(origin),
      });
      return { status: "done" };
    },

    /**
     * Création d'un cabinet et de son vétérinaire administrateur. L'adresse est prouvée par le
     * code envoyé : aucune session n'est ouverte avant. Si l'adresse a déjà un compte, le
     * parcours est identique à l'écran et la personne reçoit un e-mail l'en informant.
     */
    async register(
      input: {
        organizationName: string;
        displayName: string;
        email: string;
        plan: Plan;
        password: string;
        /** Conditions acceptées et pouvoir de souscrire confirmé : obligatoires (cahier §14). */
        acceptTerms: true;
        authorized: true;
        /** Langue de la page d'inscription, gardée pour l'interface (ADR 0022). */
        uiLocale?: Locale;
      },
      origin: RequestOrigin,
    ): Promise<RegisterResult> {
      const address = input.email.trim().toLowerCase();
      const problems = passwordProblems(input.password, {
        email: address,
        displayName: input.displayName,
      });
      if (problems.length) return { status: "invalid_password", problems };
      if (!(await allowed("signupPerIp", origin.ip)))
        return { status: "rate_limited" };

      const decoy = () => {
        // Jeton sans défi associé : le code saisi sera refusé comme pour un code erroné.
        const challengeToken = createToken();
        return email
          .send(
            existingAccountEmail(
              address,
              new URL("/connexion", appUrl).toString(),
            ),
          )
          .then(() => ({ status: "code_required" as const, challengeToken }));
      };
      // Empreinte calculée dans tous les cas : même durée de réponse, compte existant ou non.
      const passwordHash = await hashPassword(input.password);
      if (await repo.emailRegistered(address)) return decoy();

      const organizationId = randomUUID();
      const userId = randomUUID();
      const membershipId = randomUUID();
      try {
        await withTenant(db, { organizationId, userId }, async (tx) => {
          await tx.insert(organizations).values({
            id: organizationId,
            name: input.organizationName.trim(),
          });
          await tx.insert(users).values({
            id: userId,
            email: address,
            displayName: input.displayName.trim(),
            uiLocale: input.uiLocale ?? DEFAULT_LOCALE,
          });
          await tx.insert(memberships).values({
            id: membershipId,
            organizationId,
            userId,
            role: "admin_vet",
          });
          await tx.execute(
            sql`SELECT auth.set_initial_password(${userId}, ${passwordHash})`,
          );
          // Essai pilote de 2 mois, puis la formule choisie (ADR 0011).
          await startSubscription(tx, organizationId, input.plan);
          await tx.insert(auditEvents).values([
            {
              organizationId,
              actorMembershipId: membershipId,
              action: "organization.created",
              targetType: "organization",
              targetId: organizationId,
              metadata: {
                termsVersion: TERMS_VERSION,
                termsAccepted: input.acceptTerms,
                authorityConfirmed: input.authorized,
              },
            },
            {
              organizationId,
              actorMembershipId: membershipId,
              action: "membership.created",
              targetType: "membership",
              targetId: membershipId,
              metadata: { role: "admin_vet", source: "signup" },
            },
          ]);
        });
      } catch (error) {
        // Inscription simultanée avec la même adresse : même réponse qu'un compte existant.
        if (isUniqueViolation(error)) return decoy();
        throw error;
      }

      const challengeToken = await sendSecurityCode(userId, address);
      await repo.recordLoginEvent({
        kind: "signup_completed",
        userId,
        organizationId,
        ...eventOrigin(origin),
      });
      return { status: "code_required", challengeToken };
    },
  };
}

export type AuthService = ReturnType<typeof authService>;

function isUniqueViolation(error: unknown): boolean {
  const candidate = error as { code?: string; cause?: { code?: string } };
  return candidate.code === "23505" || candidate.cause?.code === "23505";
}
