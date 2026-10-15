import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { emailConfig, senderFor } from "./config";
import { EmailSendError } from "./scaleway";

const scaleway = {
  EMAIL_PROVIDER: "scaleway",
  SCW_SECRET_KEY: randomUUID(),
  SCW_DEFAULT_PROJECT_ID: randomUUID(),
  EMAIL_DOMAIN: "mail.stivea.test",
};

describe("configuration des e-mails", () => {
  it("Mailpit en local seulement", () => {
    expect(emailConfig({ SMTP_HOST: "localhost", SMTP_PORT: "1025" })).toEqual({
      mode: "smtp",
      host: "localhost",
      port: 1025,
    });
    expect(() =>
      emailConfig({ APP_ENV: "staging", SMTP_HOST: "x", SMTP_PORT: "25" }),
    ).toThrow("EMAIL_PROVIDER");
  });

  it("Scaleway exige clé, projet et domaine, sans jamais citer leurs valeurs", () => {
    const partial = { ...scaleway, SCW_SECRET_KEY: undefined };
    let message = "";
    try {
      emailConfig({ ...partial, APP_ENV: "production" });
    } catch (error) {
      message = error instanceof Error ? error.message : "";
    }
    expect(message).toContain("SCW_SECRET_KEY");
    expect(message).not.toContain(partial.SCW_DEFAULT_PROJECT_ID);
    expect(emailConfig({ ...scaleway, APP_ENV: "production" }).mode).toBe(
      "scaleway",
    );
  });
});

describe("envoi par Scaleway Transactional Email", () => {
  it("envoie en région Paris, depuis l'adresse du bon expéditeur", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const sender = senderFor(emailConfig(scaleway), "marketing", (async (
      url: string,
      init: RequestInit,
    ) => {
      calls.push({ url, init });
      return new Response("{}", { status: 200 });
    }) as typeof fetch);
    await sender.send({
      to: "claire@tilleuls.test",
      subject: "Bienvenue",
      text: "Bonjour",
      html: "<p>Bonjour</p>",
      headers: { "List-Unsubscribe": "<https://stivea.test/d>" },
    });
    const [call] = calls;
    expect(call?.url).toContain(
      "/transactional-email/v1alpha1/regions/fr-par/",
    );
    const body = JSON.parse(String(call?.init.body)) as {
      from: { email: string };
      additional_headers: unknown[];
    };
    expect(body.from.email).toBe("bonjour@mail.stivea.test");
    expect(body.additional_headers).toHaveLength(1);
  });

  it("un refus ne laisse qu'un code HTTP, jamais l'adresse ni le contenu", async () => {
    const sender = senderFor(
      emailConfig(scaleway),
      "service",
      (async () => new Response("{}", { status: 403 })) as typeof fetch,
    );
    const failure = await sender
      .send({
        to: "lea@tilleuls.test",
        subject: "Code 123456",
        text: "",
        html: "",
      })
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(EmailSendError);
    expect(String(failure)).not.toMatch(/lea|123456/);
  });
});
