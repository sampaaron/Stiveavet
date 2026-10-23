import { DrizzleQueryError } from "drizzle-orm/errors";
import { describe, expect, it } from "vitest";

import { DatabaseFailure, safeDbError, withSafeDbErrors } from "./errors";

function pgError(fields: Record<string, string>) {
  return Object.assign(new Error(fields.message), {
    severity: "ERROR",
    ...fields,
  });
}

const query = (cause: Error) =>
  new DrizzleQueryError(
    "insert into users (email) values ($1)",
    ["claire.fontaine@tilleuls.test"],
    cause,
  );

describe("erreurs de base de données", () => {
  it("retire les paramètres de la requête et le détail de PostgreSQL", () => {
    const error = safeDbError(
      query(
        pgError({
          code: "23505",
          message:
            'duplicate key value violates unique constraint "users_email_key"',
          detail: "Key (email)=(claire.fontaine@tilleuls.test) already exists.",
          constraint: "users_email_key",
        }),
      ),
    );
    expect(error).toBeInstanceOf(DatabaseFailure);
    const failure = error as DatabaseFailure;
    expect(failure.code).toBe("23505");
    expect(failure.cause.constraint).toBe("users_email_key");
    expect(
      JSON.stringify({ ...failure, message: failure.message }),
    ).not.toContain("claire");
  });

  it("garde le message d'une règle du projet, pas celui d'une valeur refusée", () => {
    const rule = safeDbError(
      query(pgError({ code: "23514", message: "dernier administrateur" })),
    ) as DatabaseFailure;
    expect(rule.cause.message).toBe("dernier administrateur");
    const value = safeDbError(
      query(
        pgError({
          code: "22P02",
          message: 'invalid input syntax for type uuid: "Rex a vomi"',
        }),
      ),
    ) as DatabaseFailure;
    expect(value.cause.message).toBe("");
  });

  it("laisse passer les autres erreurs telles quelles", () => {
    const other = new Error("autre");
    expect(safeDbError(other)).toBe(other);
  });

  it("sans code ni champ texte, l'erreur reste générique", () => {
    const failure = safeDbError(
      new DrizzleQueryError("select 1", [], undefined as unknown as Error),
    ) as DatabaseFailure;
    expect(failure.message).toBe("Requête refusée par la base");
    expect(failure.cause).toEqual({
      code: undefined,
      message: "",
      constraint: undefined,
    });
    const odd = safeDbError(
      Object.assign(new Error(), {
        severity: "ERROR",
        code: 42,
        message: { texte: "inattendu" },
        constraint: null,
      }),
    ) as DatabaseFailure;
    expect([odd.code, odd.cause.message, odd.cause.constraint]).toEqual([
      undefined,
      "",
      undefined,
    ]);
  });

  it("protège chaque méthode d'un dépôt", async () => {
    const repo = withSafeDbErrors({
      fail: () =>
        Promise.reject(
          query(pgError({ code: "40001", message: "serialization" })),
        ),
      ok: (value: number) => Promise.resolve(value * 2),
      label: "dépôt",
    });
    await expect(repo.ok(2)).resolves.toBe(4);
    expect(repo.label).toBe("dépôt");
    await expect(repo.fail()).rejects.toBeInstanceOf(DatabaseFailure);
  });
});
