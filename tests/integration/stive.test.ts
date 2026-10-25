import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { fakeAiGateway } from "@/adapters/ai-gateway/fake";
import type { AiGateway, StiveChatInput } from "@/adapters/ai-gateway/types";
import { DomainError } from "@/domains/equipe/actor";
import type { Actor } from "@/domains/equipe/actor";
import { ROLE_PERMISSIONS } from "@/domains/equipe/permissions";
import { stiveService } from "@/domains/stive/service";
import { followupsService } from "@/domains/suivis/service";
import { followups as fixtureFollowups } from "@/fixtures/cabinet-tilleuls";

import { pools } from "./support/db";

/**
 * Stive (ADR 0035) : conversations visibles de leur seul auteur, dossier lu avec les droits de
 * la personne, rien d'enregistré si l'IA ne répond pas, ni nom ni numéro envoyé à l'IA.
 */

const { app, admin, appDb } = pools();
afterAll(async () => {
  await app.end();
  await admin.end();
});

const sent: StiveChatInput[] = [];
let failing = false;
const ai: AiGateway = {
  ...fakeAiGateway,
  async stiveChat(input) {
    sent.push(input);
    if (failing) throw new Error("panne");
    return fakeAiGateway.stiveChat(input);
  },
};
const stive = stiveService({
  db: appDb,
  ai,
  followups: followupsService(appDb),
});

const caramel = fixtureFollowups.find(
  (entry) => entry.animal.name === "Caramel",
);

async function actor(email: string): Promise<Actor> {
  const { rows } = await admin.query(
    `SELECT m.id, m.user_id, m.role, m.organization_id FROM memberships m
     JOIN users u ON u.id = m.user_id WHERE u.email = $1`,
    [email],
  );
  const row = rows[0] as
    | {
        id: string;
        user_id: string;
        role: Actor["role"];
        organization_id: string;
      }
    | undefined;
  if (!row) throw new Error(`Membre fictif introuvable : ${email}`);
  return {
    organizationId: row.organization_id,
    userId: row.user_id,
    membershipId: row.id,
    role: row.role,
    permissions: new Set(ROLE_PERMISSIONS[row.role].defaults),
  };
}

async function refusal(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
}

let claire: Actor;
let hugo: Actor;
let lea: Actor;
let paul: Actor;
beforeAll(async () => {
  claire = await actor("claire.fontaine@tilleuls.test");
  hugo = await actor("hugo.marchal@tilleuls.test");
  lea = await actor("lea.roux@tilleuls.test");
  paul = await actor("paul.martin@cabinet-martin.test");
});

describe("Stive", () => {
  it("répond en s'appuyant sur le dossier cité, sans nom ni numéro de propriétaire", async () => {
    sent.length = 0;
    const result = await stive.ask(claire, {
      conversationId: null,
      message: "Comment va Caramel depuis son opération ?",
      followup: "auto",
      language: "fr",
    });
    expect(result).toMatchObject({
      status: "answered",
      followupId: caramel?.id,
      ambiguous: null,
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.case?.animal).toBe("Caramel");
    const payload = JSON.stringify(sent[0]);
    expect(payload).not.toContain("Morel");
    expect(payload).not.toMatch(
      /\d{2}[\s.]?\d{2}[\s.]?\d{2}[\s.]?\d{2}[\s.]?\d{2}/,
    );
    if (result.status !== "answered") throw new Error("pas de réponse");

    const conversation = await stive.conversation(
      claire,
      result.conversationId,
    );
    expect(conversation?.messages.map((message) => message.author)).toEqual([
      "vet",
      "stive",
    ]);
    expect(conversation?.followupId).toBe(caramel?.id);

    // Message suivant : la conversation et le dossier sont repris.
    sent.length = 0;
    await stive.ask(claire, {
      conversationId: result.conversationId,
      message: "Et pour la plaie ?",
      followup: "auto",
      language: "fr",
    });
    expect(sent[0]?.turns).toHaveLength(3);
    expect(sent[0]?.case?.animal).toBe("Caramel");
  });

  it("une conversation n'est visible que de son auteur", async () => {
    const [mine] = await stive.conversations(claire);
    expect(mine).toBeDefined();
    if (!mine) return;
    expect(await stive.conversations(hugo)).toEqual([]);
    expect(await stive.conversation(hugo, mine.id)).toBeNull();
    expect(
      await refusal(
        stive.ask(hugo, {
          conversationId: mine.id,
          message: "Je lis la conversation de Claire ?",
          followup: "none",
          language: "fr",
        }),
      ),
    ).toBe("not_found");
    expect(await stive.remove(hugo, mine.id)).toBe(false);
    const { rows } = await admin.query(
      "SELECT count(*)::int AS n FROM stive_conversations WHERE organization_id = $1",
      [paul.organizationId],
    );
    expect(rows[0]).toEqual({ n: 0 });
    expect(await stive.conversations(paul)).toEqual([]);
  });

  it("sans la permission stive.use, Stive n'existe pas", async () => {
    expect(lea.permissions.has("stive.use")).toBe(false);
    expect(await refusal(stive.conversations(lea))).toBe("not_found");
    expect(
      await refusal(
        stive.ask(lea, {
          conversationId: null,
          message: "Bonjour",
          followup: "none",
          language: "fr",
        }),
      ),
    ).toBe("not_found");
  });

  it("si l'IA ne répond pas, rien n'est enregistré", async () => {
    const before = (await stive.conversations(claire)).length;
    failing = true;
    try {
      expect(
        await stive.ask(claire, {
          conversationId: null,
          message: "Bonjour Stive",
          followup: "none",
          language: "fr",
        }),
      ).toEqual({ status: "unavailable" });
    } finally {
      failing = false;
    }
    expect(await stive.conversations(claire)).toHaveLength(before);
  });

  it("la personne efface sa conversation et ses messages", async () => {
    const [mine] = await stive.conversations(claire);
    if (!mine) throw new Error("aucune conversation");
    expect(await stive.remove(claire, mine.id)).toBe(true);
    expect(await stive.conversation(claire, mine.id)).toBeNull();
    const { rows } = await admin.query(
      "SELECT count(*)::int AS n FROM stive_messages WHERE conversation_id = $1",
      [mine.id],
    );
    expect(rows[0]).toEqual({ n: 0 });
  });
});
