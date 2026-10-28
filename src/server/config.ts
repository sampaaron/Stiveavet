import type { z } from "zod";

/** Valide une configuration ; une erreur ne cite que les noms des variables, jamais leurs valeurs. */
export function parseConfig<Schema extends z.ZodType>(
  schema: Schema,
  source: Record<string, string | undefined>,
): z.output<Schema> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const names = [
      ...new Set(result.error.issues.map((issue) => issue.path.join("."))),
    ];
    throw new Error(`Configuration invalide : ${names.join(", ")}`);
  }
  return result.data;
}
