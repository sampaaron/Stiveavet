import { describe, expect, it } from "vitest";

import { ownerKeyword } from "./keywords";

describe("mots-clés du propriétaire", () => {
  it("reconnaît OUI, STOP et REPRENDRE seuls, sans tenir compte de la casse", () => {
    expect(ownerKeyword("Oui !")).toBe("yes");
    expect(ownerKeyword("d'accord")).toBe("yes");
    expect(ownerKeyword("STOP")).toBe("stop");
    expect(ownerKeyword("Reprendre")).toBe("resume");
  });

  it("reconnaît les réponses à la question posée après un STOP dans le groupe", () => {
    expect(ownerKeyword("GROUPE")).toBe("leave_group");
    expect(ownerKeyword("quitter le groupe")).toBe("leave_group");
    expect(ownerKeyword("Leave group")).toBe("leave_group");
    expect(ownerKeyword("TOUT")).toBe("stop_all");
    expect(ownerKeyword("tout arrêter")).toBe("stop_all");
    expect(ownerKeyword("stop all")).toBe("stop_all");
  });

  it("ne prend jamais une phrase pour un mot-clé", () => {
    expect(ownerKeyword("je ne veux pas que tout s'arrête")).toBeNull();
    expect(ownerKeyword("le groupe c'est bien")).toBeNull();
  });
});
