import { DrizzleQueryError } from "drizzle-orm/errors";
import { describe, expect, it } from "vitest";

import { DomainError } from "@/domains/commun/actor";
import { translateDbError } from "./service";

function dbError(fields: {
  code: string;
  message: string;
  constraint?: string;
}) {
  return new DrizzleQueryError(
    "update memberships set role = $1",
    ["vet"],
    Object.assign(new Error(fields.message), { severity: "ERROR", ...fields }),
  );
}

function translated(error: unknown): unknown {
  try {
    translateDbError(error);
  } catch (thrown) {
    return thrown;
  }
  throw new Error("Une erreur était attendue");
}

describe("refus de la base traduits par nom de contrainte", () => {
  it("le dernier administrateur devient un refus métier, quel que soit le message", () => {
    const error = translated(
      dbError({
        code: "23514",
        message: "message reformulé",
        constraint: "memberships_keep_one_admin",
      }),
    );
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe("last_admin");
  });

  it("relance tout autre refus, même de classe 23514", () => {
    for (const error of [
      dbError({
        code: "23514",
        message: "seul un vétérinaire actif peut être de garde",
      }),
      dbError({
        code: "23514",
        message: "le cabinet doit garder un vétérinaire administrateur actif",
      }),
      dbError({ code: "23505", message: "duplicate", constraint: "x_key" }),
      new Error("autre"),
    ])
      expect(translated(error)).not.toBeInstanceOf(DomainError);
  });
});
