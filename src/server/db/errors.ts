import { DrizzleQueryError } from "drizzle-orm/errors";

/**
 * Erreur de base de données sans les données de la requête. Drizzle met les paramètres dans
 * le message (« params: … ») et PostgreSQL met les valeurs refusées dans `detail` : une erreur
 * relancée telle quelle finirait dans les journaux du serveur avec un e-mail, un numéro ou du
 * contenu clinique. Seuls restent le code, la contrainte et le message de PostgreSQL, sauf
 * pour les erreurs de données (classe 22), dont le message cite la valeur refusée.
 */
export class DatabaseFailure extends Error {
  override readonly name = "DatabaseFailure";
  readonly code: string | undefined;
  override readonly cause: {
    code: string | undefined;
    message: string;
    constraint: string | undefined;
  };

  constructor(code: string | undefined, message: string, constraint?: string) {
    super(`Requête refusée par la base${code ? ` (${code})` : ""}`);
    this.code = code;
    this.cause = { code, message, constraint };
  }
}

type DriverError = { code?: unknown; message?: unknown; constraint?: unknown };

const asText = (value: unknown) =>
  typeof value === "string" ? value : undefined;

export function safeDbError(error: unknown): unknown {
  const driver: unknown =
    error instanceof DrizzleQueryError ? error.cause : error;
  const isDriverError =
    driver instanceof Error && "severity" in driver && "code" in driver;
  if (!(error instanceof DrizzleQueryError) && !isDriverError) return error;
  const { code, message, constraint } = (driver ?? {}) as DriverError;
  const sqlState = asText(code);
  return new DatabaseFailure(
    sqlState,
    sqlState?.startsWith("22") ? "" : (asText(message) ?? ""),
    asText(constraint),
  );
}

/** Code SQLSTATE d'une erreur de base (Drizzle, pilote ou déjà réduite) ; `undefined` sinon. */
export function pgErrorCode(error: unknown): string | undefined {
  const failure = safeDbError(error);
  return failure instanceof DatabaseFailure ? failure.code : undefined;
}

/** Contrainte en cause d'une erreur de base, si PostgreSQL la nomme. */
export function pgConstraint(error: unknown): string | undefined {
  const failure = safeDbError(error);
  return failure instanceof DatabaseFailure
    ? failure.cause.constraint
    : undefined;
}

/** Doublon refusé par une contrainte d'unicité (23505). */
export function isUniqueViolation(error: unknown): boolean {
  return pgErrorCode(error) === "23505";
}

/** Mêmes méthodes, dont les erreurs de base sont relancées sans les données de la requête. */
export function withSafeDbErrors<T extends object>(methods: T): T {
  return Object.fromEntries(
    Object.entries(methods).map(([name, method]) => [
      name,
      typeof method === "function"
        ? async (...args: unknown[]) => {
            try {
              return await (method as (...a: unknown[]) => unknown)(...args);
            } catch (error) {
              throw safeDbError(error);
            }
          }
        : method,
    ]),
  ) as T;
}
