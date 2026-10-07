import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { MemoryEmailSender } from "@/adapters/email/memory";
import { DEMO_SEQUENCE_DAYS } from "@/domains/demo/emails";
import { demoService } from "@/domains/demo/service";
import type { EmailSender } from "@/adapters/email/types";

import { SEED } from "../../db/seed/cabinets-fictifs";
import { asApp, errorCode, pools } from "./support/db";

const { app, admin, appDb } = pools();
afterAll(async () => {
  await app.end();
  await admin.end();
});

const APP_URL = "http://localhost:3000";
let outbox: MemoryEmailSender;
const service = (email: EmailSender = outbox) =>
  demoService({ db: appDb, email, appUrl: APP_URL });

const request = (
  email: string,
  overrides: Partial<{
    cabinetName: string;
    vetCount: number;
    locale: "fr" | "en";
  }> = {},
) => ({
  email,
  cabinetName: "Cabinet des Essais",
  vetCount: 2,
  locale: "fr" as const,
  ...overrides,
});

/** Recule l'horloge d'un prospect : sa demande et ses envois datent d'il y a `days` jours. */
async function ageLead(email: string, days: number) {
  await admin.query(
    `UPDATE marketing.demo_leads SET created_at = created_at - make_interval(days => $2) WHERE email = $1`,
    [email, days],
  );
  await admin.query(
    `UPDATE marketing.demo_emails e SET reserved_at = reserved_at - make_interval(days => $2)
     FROM marketing.demo_leads l WHERE l.id = e.lead_id AND l.email = $1`,
    [email, days],
  );
}

function tokenFrom(text: string, pattern: RegExp): string {
  const match = pattern.exec(text);
  if (!match?.[1]) throw new Error("jeton absent de l'e-mail");
  return match[1];
}

beforeEach(async () => {
  outbox = new MemoryEmailSender();
  await admin.query("DELETE FROM marketing.demo_leads");
  await admin.query(
    "DELETE FROM auth.rate_limits WHERE bucket LIKE 'demo_per_ip:%'",
  );
});

describe("demande de démo", () => {
  it("ouvre la démo et envoie aussitôt le premier e-mail, avec accès et désinscription", async () => {
    const result = await service().capture(
      request("prospect@exemple.test"),
      null,
    );
    if (result.status !== "captured") throw new Error("attendu : captured");

    expect(await service().access(result.accessToken)).toEqual({
      locale: "fr",
      cabinetName: "Cabinet des Essais",
    });
    expect(outbox.sent).toHaveLength(1);
    const [mail] = outbox.sent;
    expect(mail?.subject).toBe("Votre démo Stivea Vet est prête");
    expect(mail?.text).toContain(`${APP_URL}/demo/acces/${result.accessToken}`);
    expect(mail?.text).toMatch(/\/fr\/desinscription\?jeton=[\w-]{43}/);
    expect(mail?.headers?.["List-Unsubscribe"]).toMatch(
      /^<http:\/\/localhost:3000\/api\/desinscription\?jeton=[\w-]{43}>$/,
    );
    expect(mail?.headers?.["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click",
    );
  });

  it("écrit en anglais à un prospect anglophone", async () => {
    await service().capture(
      request("vet@example.test", { locale: "en" }),
      null,
    );
    expect(outbox.sent[0]?.subject).toBe("Your Stivea Vet demo is ready");
    expect(outbox.sent[0]?.text).toContain("/en/unsubscribe?jeton=");
  });

  it("une nouvelle demande renouvelle l'accès sans renvoyer d'e-mail ni relancer la séquence", async () => {
    const first = await service().capture(
      request("deux-fois@exemple.test"),
      null,
    );
    const second = await service().capture(
      request("DEUX-FOIS@exemple.test", { cabinetName: "Nouveau nom" }),
      null,
    );
    if (first.status !== "captured" || second.status !== "captured")
      throw new Error("attendu : captured");

    expect(outbox.sent).toHaveLength(1);
    expect(await service().access(first.accessToken)).toBeNull();
    expect(await service().access(second.accessToken)).toEqual({
      locale: "fr",
      cabinetName: "Nouveau nom",
    });
  });

  it("refuse un jeton inconnu, mal formé ou expiré", async () => {
    const result = await service().capture(
      request("expire@exemple.test"),
      null,
    );
    if (result.status !== "captured") throw new Error("attendu : captured");

    expect(await service().access(undefined)).toBeNull();
    expect(await service().access("pas-un-jeton")).toBeNull();
    expect(await service().access("A".repeat(43))).toBeNull();
    await admin.query(
      "UPDATE marketing.demo_leads SET access_expires_at = now() - interval '1 second' WHERE email = $1",
      ["expire@exemple.test"],
    );
    expect(await service().access(result.accessToken)).toBeNull();
  });

  it("limite les demandes par adresse IP", async () => {
    const outcomes = [];
    for (let i = 0; i < 11; i += 1)
      outcomes.push(
        (await service().capture(request(`ip${i}@exemple.test`), "203.0.113.9"))
          .status,
      );
    expect(outcomes.slice(0, 10).every((status) => status === "captured")).toBe(
      true,
    );
    expect(outcomes[10]).toBe("rate_limited");
  });

  it("la démo reste ouverte même si le premier e-mail ne part pas ; il repartira plus tard", async () => {
    const failing: EmailSender = {
      send: () => Promise.reject(new Error("SMTP indisponible")),
    };
    const result = await service(failing).capture(
      request("smtp@exemple.test"),
      null,
    );
    if (result.status !== "captured") throw new Error("attendu : captured");
    expect(await service().access(result.accessToken)).not.toBeNull();

    expect(await service().dispatch()).toMatchObject({ sent: 1, failed: 0 });
    expect(outbox.sent[0]?.subject).toBe("Votre démo Stivea Vet est prête");
    // Sans le jeton d'accès (jamais stocké en clair), l'e-mail renvoie vers le formulaire.
    expect(outbox.sent[0]?.text).toContain(
      "Redemander l'accès à la démo : http://localhost:3000/fr/demo",
    );
  });
});

describe("séquence de cinq e-mails", () => {
  it("envoie cinq e-mails sur deux semaines, chacun une seule fois", async () => {
    await service().capture(request("sequence@exemple.test"), null);
    expect(outbox.sent).toHaveLength(1);

    let elapsed = 0;
    for (const day of DEMO_SEQUENCE_DAYS.slice(1)) {
      await ageLead("sequence@exemple.test", day - elapsed - 1);
      elapsed = day - 1;
      expect((await service().dispatch()).sent, `veille du jour ${day}`).toBe(
        0,
      );
      await ageLead("sequence@exemple.test", 1);
      elapsed = day;
      expect((await service().dispatch()).sent, `jour ${day}`).toBe(1);
      expect(
        (await service().dispatch()).sent,
        `jour ${day}, second passage`,
      ).toBe(0);
    }

    expect(outbox.sent.map((mail) => mail.subject)).toEqual([
      "Votre démo Stivea Vet est prête",
      "Comment Numa accompagne un propriétaire après une intervention",
      "Urgences : Numa alerte, vous décidez",
      "Votre équipe, vos droits, vos données",
      "Démarrer l'essai pilote à 86 € HT",
    ]);
    expect(Math.max(...DEMO_SEQUENCE_DAYS)).toBeLessThan(14);
    await ageLead("sequence@exemple.test", 10);
    expect((await service().dispatch()).sent).toBe(0);
  });

  it("après une longue interruption, n'envoie qu'un e-mail par passage et par jour", async () => {
    await service().capture(request("retard@exemple.test"), null);
    await ageLead("retard@exemple.test", 13);
    expect((await service().dispatch()).sent).toBe(1);
    expect((await service().dispatch()).sent).toBe(0);
    await ageLead("retard@exemple.test", 1);
    expect((await service().dispatch()).sent).toBe(1);
    expect(outbox.sent).toHaveLength(3);
  });

  it("s'arrête dès la désinscription, par la page ou en un clic", async () => {
    await service().capture(request("stop@exemple.test"), null);
    const token = tokenFrom(
      outbox.sent[0]?.text ?? "",
      /desinscription\?jeton=([\w-]{43})/,
    );

    expect(await service().unsubscribe(token)).toBe(true);
    expect(await service().unsubscribe(token)).toBe(true);
    expect(await service().unsubscribe("B".repeat(43))).toBe(false);
    expect(await service().unsubscribe(undefined)).toBe(false);

    await ageLead("stop@exemple.test", 14);
    expect((await service().dispatch()).sent).toBe(0);
    // Une nouvelle demande de démo ne réinscrit pas la personne.
    await service().capture(request("stop@exemple.test"), null);
    await ageLead("stop@exemple.test", 3);
    expect((await service().dispatch()).sent).toBe(0);
    expect(outbox.sent).toHaveLength(1);
  });

  it("s'arrête dès que l'essai démarre : un compte existe pour cette adresse", async () => {
    const { rows } = await admin.query<{ email: string }>(
      "SELECT u.email FROM users u JOIN memberships m ON m.user_id = u.id WHERE m.organization_id = $1 LIMIT 1",
      [SEED.tilleuls],
    );
    const customer = rows[0]?.email;
    if (!customer) throw new Error("compte fictif introuvable");

    // Une adresse qui a déjà un compte ne reçoit pas la séquence.
    await service().capture(request(customer), null);
    expect(outbox.sent).toHaveLength(0);

    await admin.query("DELETE FROM marketing.demo_leads");
    await service().capture(request("futur-client@exemple.test"), null);
    expect(outbox.sent).toHaveLength(1);
    await admin.query(
      "UPDATE users SET email = 'futur-client@exemple.test' WHERE email = $1",
      [customer],
    );
    try {
      await ageLead("futur-client@exemple.test", 3);
      expect((await service().dispatch()).sent).toBe(0);
    } finally {
      await admin.query(
        "UPDATE users SET email = $1 WHERE email = 'futur-client@exemple.test'",
        [customer],
      );
    }
  });

  it("deux envois simultanés ne doublent jamais un e-mail", async () => {
    await service().capture(request("course@exemple.test"), null);
    await ageLead("course@exemple.test", 2);
    const results = await Promise.all([
      service().dispatch(),
      service().dispatch(),
    ]);
    expect(results.reduce((total, result) => total + result.sent, 0)).toBe(1);
    expect(outbox.sent).toHaveLength(2);
  });

  it("supprime les prospects un an après leur demande", async () => {
    await service().capture(request("ancien@exemple.test"), null);
    await service().capture(request("recent@exemple.test"), null);
    await ageLead("ancien@exemple.test", 366);
    await ageLead("recent@exemple.test", 300);

    expect((await service().dispatch()).purged).toBe(1);
    const { rows } = await admin.query<{ email: string }>(
      "SELECT email FROM marketing.demo_leads",
    );
    expect(rows.map((row) => row.email)).toEqual(["recent@exemple.test"]);
  });

  it("le calendrier de la base est celui de l'application", async () => {
    const { rows } = await admin.query<{ days: number[] }>(
      "SELECT marketing.sequence_days() AS days",
    );
    expect(rows[0]?.days).toEqual([...DEMO_SEQUENCE_DAYS]);
  });
});

describe("rôle applicatif et prospects", () => {
  it.each([
    ["lire", "SELECT * FROM marketing.demo_leads"],
    ["modifier", "UPDATE marketing.demo_leads SET unsubscribed_at = NULL"],
    ["supprimer", "DELETE FROM marketing.demo_emails"],
    [
      "insérer",
      "INSERT INTO marketing.demo_emails (lead_id, step, unsubscribe_token_hash) VALUES (gen_random_uuid(), 1, '\\x00')",
    ],
  ])(
    "ne peut pas %s directement les tables marketing",
    async (_label, statement) => {
      expect(
        await asApp(app, null, (client) => errorCode(client.query(statement))),
      ).toBe("42501");
    },
  );

  it("ne peut ni avancer la séquence ni sauter une étape", async () => {
    await service().capture(request("saut@exemple.test"), null);
    const { rows } = await admin.query<{ id: string }>(
      "SELECT id FROM marketing.demo_leads WHERE email = 'saut@exemple.test'",
    );
    const leadId = rows[0]?.id;
    const reserved = await asApp(app, null, async (client) => {
      const result = await client.query<{ ok: boolean }>(
        "SELECT marketing.reserve_demo_email($1, 3::smallint, decode(repeat('ab', 32), 'hex')) AS ok",
        [leadId],
      );
      return result.rows[0]?.ok;
    });
    expect(reserved).toBe(false);
  });

  it("ne peut pas appeler la règle interne d'éligibilité", async () => {
    expect(
      await asApp(app, null, (client) =>
        errorCode(
          client.query(
            "SELECT marketing.sequence_open(l) FROM (SELECT NULL::marketing.demo_leads AS l) s",
          ),
        ),
      ),
    ).toBe("42501");
  });
});
