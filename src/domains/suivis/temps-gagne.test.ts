import { describe, expect, it } from "vitest";

import { timeSaved } from "./temps-gagne";

describe("temps gagné", () => {
  it("compte 4 min par prise de nouvelles, moins 1 min par suivi lancé", () => {
    expect(timeSaved({ checkIns: 30, launched: 10 })).toEqual({
      minutes: 110,
      checkIns: 30,
    });
  });

  it("ne descend jamais sous zéro", () => {
    expect(timeSaved({ checkIns: 0, launched: 3 }).minutes).toBe(0);
  });
});
