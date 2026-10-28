import type { AppDictionary } from "@/i18n/app/types";

/** Libellé d'un type de tâche ; un type inconnu de l'écran reste « technique ». */
export function kindLabel(t: AppDictionary, kind: string): string {
  const kinds = t.tasks.kinds;
  return Object.hasOwn(kinds, kind)
    ? kinds[kind as keyof typeof kinds]
    : t.tasks.unknownKind;
}
