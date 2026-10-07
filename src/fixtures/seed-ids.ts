/** Identifiants stables des cabinets fictifs créés par `pnpm db:seed`. */
export const SEED = {
  tilleuls: "0b9f2c11-6a3e-4d27-9c40-5e1d8a7b3f01",
  martin: "7c4e1a90-2b5d-4f38-8e16-9a0c3d2b1e02",
} as const;

/**
 * Les écrans de référence (tableau de bord, dossier) lisent encore les données fictives du
 * lot 2 ; elles ne sont montrées qu'au cabinet des Tilleuls, jamais à un autre cabinet.
 * Disparaît quand ces écrans liront la base (domaine suivis).
 */
export function showsReferenceFixtures(organizationId: string): boolean {
  return organizationId === SEED.tilleuls;
}
