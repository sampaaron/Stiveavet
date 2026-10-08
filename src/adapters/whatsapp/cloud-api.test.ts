import { describe, expect, it } from "vitest";

import { renderTemplate } from "@/domains/whatsapp/modeles";

import { classifyGraphError, cloudApiConnector } from "./cloud-api";
import { metaImitation } from "./imitation";
import { WhatsAppSendError } from "./types";

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
