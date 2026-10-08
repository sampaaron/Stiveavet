import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { renderTemplate } from "@/domains/whatsapp/modeles";

import { classifyGraphError, cloudApiConnector } from "./cloud-api";
import { metaImitation } from "./imitation";
import { WhatsAppMediaError, WhatsAppSendError } from "./types";

const TOKEN = "jeton-fictif-de-test";
const OWNER = "+33639980101";

function setup() {
  const meta = metaImitation({ accessToken: TOKEN });
  const connector = cloudApiConnector({
    fetch: meta.fetch,
    phoneNumberId: "1234567890",
    accessToken: TOKEN,
  });
  return { meta, connector };
}

const intro = renderTemplate("suivi_premier_message", "fr", {
  first_name: "Margaux",
  practice: "Clinique des Tilleuls",
  vet: "Dr Fontaine",
  animal: "Caramel",
});

async function failureOf(promise: Promise<unknown>) {
  const error: unknown = await promise.catch((caught: unknown) => caught);
  if (!(error instanceof WhatsAppSendError)) throw new Error("pas d'échec");
  return { failure: error.failure, code: error.code };
}

describe("connecteur WhatsApp Cloud API", () => {
  it("un modèle part avec ses paramètres nommés ; le propriétaire lit le texte du catalogue", async () => {
    const { meta, connector } = setup();
    const { externalRef } = await connector.send({
      to: { kind: "phone", phone: OWNER },
      content: {
        kind: "template",
        key: intro.key,
        language: "fr",
        params: intro.params,
      },
      reference: "8f0c1a52-0d6e-4c1f-9f4b-1c2d3e4f5a6b",
    });
    expect(externalRef).toMatch(/^wamid\./);
    expect(meta.sent).toEqual([
      expect.objectContaining({
        type: "template",
        template: "suivi_premier_message",
        body: intro.body,
        reference: "8f0c1a52-0d6e-4c1f-9f4b-1c2d3e4f5a6b",
        phoneNumberId: "1234567890",
      }),
    ]);
  });

  it("hors de la fenêtre de 24 h, un texte libre est refusé par Meta et classé comme tel", async () => {
    const { meta, connector } = setup();
    const send = () =>
      connector.send({
        to: { kind: "phone", phone: OWNER },
        content: { kind: "text", body: "Bonjour, comment va Caramel ?" },
        reference: "ref-1",
      });
    expect(await failureOf(send())).toEqual({
      failure: "window_closed",
      code: "meta_131047",
    });
    meta.userWrites(OWNER);
    await send();
    expect(meta.sent).toHaveLength(1);
  });

  it("classe les échecs : réessai, compte, injoignable, réponse perdue", async () => {
    const { meta, connector } = setup();
    const send = () =>
      connector.send({
        to: { kind: "phone", phone: OWNER },
        content: {
          kind: "template",
          key: intro.key,
          language: "fr",
          params: intro.params,
        },
        reference: "ref-2",
      });
    meta.failNext(130429);
    expect(await failureOf(send())).toEqual({
      failure: "retry",
      code: "meta_130429",
    });
    meta.failNext(131042);
    expect((await failureOf(send())).failure).toBe("account");
    meta.nextUnreachable();
    expect((await failureOf(send())).failure).toBe("unreachable");
    expect(meta.sent).toEqual([]);

    const lost = cloudApiConnector({
      fetch: () => Promise.reject(new Error("délai dépassé")),
      phoneNumberId: "1234567890",
      accessToken: TOKEN,
    });
    expect(
      await failureOf(
        lost.send({
          to: { kind: "phone", phone: OWNER },
          content: { kind: "text", body: "x" },
          reference: "r",
        }),
      ),
    ).toEqual({ failure: "unknown", code: "network" });
  });

  it("un jeton invalide est un problème de compte ; aucun détail n'est repris dans l'erreur", async () => {
    const meta = metaImitation({ accessToken: TOKEN });
    const connector = cloudApiConnector({
      fetch: meta.fetch,
      phoneNumberId: "1234567890",
      accessToken: "autre-jeton",
    });
    const error: unknown = await connector
      .send({
        to: { kind: "phone", phone: OWNER },
        content: { kind: "text", body: "Message clinique" },
        reference: "r",
      })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(WhatsAppSendError);
    expect(String(error)).not.toMatch(/autre-jeton|33639980101|clinique/);
    expect((error as WhatsAppSendError).failure).toBe("account");
  });

  it("pas de groupe : réservé chez Meta aux comptes officiels", async () => {
    const { connector } = setup();
    expect(connector.groups).toBe(false);
    expect(
      await failureOf(
        connector.createGroup({ name: "x", members: [], idempotencyKey: "k" }),
      ),
    ).toEqual({ failure: "rejected", code: "groups_unavailable" });
  });

  it("un code inconnu est un refus, jamais un renvoi aveugle", () => {
    expect(classifyGraphError(999_999)).toBe("rejected");
    expect(classifyGraphError(131056)).toBe("retry");
  });
});

async function mediaFailureOf(promise: Promise<unknown>) {
  const error: unknown = await promise.catch((caught: unknown) => caught);
  if (!(error instanceof WhatsAppMediaError)) throw new Error("pas d'échec");
  return error.failure;
}

describe("médias reçus des propriétaires", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

  it("télécharge le fichier avec le jeton du cabinet et vérifie son empreinte", async () => {
    const { meta, connector } = setup();
    const id = meta.addMedia(jpeg, "image/jpeg");
    expect(
      await connector.downloadMedia({ mediaId: id, maxBytes: 100 }),
    ).toEqual(jpeg);
    // Empreinte en base64, comme dans les webhooks : acceptée aussi.
    const base64 = meta.addMedia(jpeg, "image/jpeg", {
      sha256: createHash("sha256").update(jpeg).digest("base64"),
    });
    expect(
      await connector.downloadMedia({ mediaId: base64, maxBytes: 100 }),
    ).toEqual(jpeg);
  });

  it("refuse un fichier trop lourd sans le télécharger, même si Meta annonce moins", async () => {
    const { meta, connector } = setup();
    const announced = meta.addMedia(jpeg, "image/jpeg", { size: 10_000 });
    expect(
      await mediaFailureOf(
        connector.downloadMedia({ mediaId: announced, maxBytes: 100 }),
      ),
    ).toBe("too_large");
    expect(meta.downloads).toEqual([]);
    const understated = meta.addMedia(new Uint8Array(500), "image/jpeg", {
      size: 10,
    });
    expect(
      await mediaFailureOf(
        connector.downloadMedia({ mediaId: understated, maxBytes: 100 }),
      ),
    ).toBe("too_large");
  });

  it("contenu modifié, média expiré, jeton refusé, identifiant invalide", async () => {
    const { meta, connector } = setup();
    const altered = meta.addMedia(jpeg, "image/jpeg", {
      sha256: "0".repeat(64),
    });
    expect(
      await mediaFailureOf(
        connector.downloadMedia({ mediaId: altered, maxBytes: 100 }),
      ),
    ).toBe("integrity");
    const expired = meta.addMedia(jpeg, "image/jpeg");
    meta.expireMedia(expired);
    expect(
      await mediaFailureOf(
        connector.downloadMedia({ mediaId: expired, maxBytes: 100 }),
      ),
    ).toBe("gone");
    const other = cloudApiConnector({
      fetch: meta.fetch,
      phoneNumberId: "1234567890",
      accessToken: "autre-jeton",
    });
    expect(
      await mediaFailureOf(
        other.downloadMedia({
          mediaId: meta.addMedia(jpeg, "image/jpeg"),
          maxBytes: 100,
        }),
      ),
    ).toBe("account");
    expect(
      await mediaFailureOf(
        connector.downloadMedia({ mediaId: "../me", maxBytes: 100 }),
      ),
    ).toBe("gone");
  });

  it("ne suit que les adresses de Meta, jamais une autre", async () => {
    const calls: string[] = [];
    const connector = cloudApiConnector({
      fetch: (async (input: string | URL | Request) => {
        const url = String(input instanceof Request ? input.url : input);
        calls.push(new URL(url).hostname);
        return Response.json({
          url: "https://169.254.169.254/latest",
          file_size: 1,
        });
      }) as typeof fetch,
      phoneNumberId: "1234567890",
      accessToken: TOKEN,
    });
    expect(
      await mediaFailureOf(
        connector.downloadMedia({ mediaId: "1234567", maxBytes: 100 }),
      ),
    ).toBe("gone");
    expect(calls).toEqual(["graph.facebook.com"]);
  });
});
