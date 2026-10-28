/**
 * Mode d'affichage de l'espace cabinet (ADR 0052) : clair, sombre, ou celui de l'appareil.
 * Simple préférence, sans valeur de sécurité, gardée dans le compte et portée par un cookie
 * pour que la page arrive déjà dans le bon mode, sans éclair blanc.
 */
export const COLOR_MODES = ["light", "dark", "system"] as const;
export type ColorMode = (typeof COLOR_MODES)[number];
export const DEFAULT_COLOR_MODE: ColorMode = "light";

export function isColorMode(value: unknown): value is ColorMode {
  return COLOR_MODES.some((mode) => mode === value);
}

/** Préfixe __Host- en HTTPS, comme le cookie de la langue. */
export function COLOR_MODE_COOKIE(secure: boolean): string {
  return secure ? "__Host-sv_mode" : "sv_mode";
}
