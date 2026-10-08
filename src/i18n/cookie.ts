/**
 * Cookie de la langue choisie (ADR 0022) : simple préférence, sans valeur de sécurité.
 * Préfixe __Host- en HTTPS, comme les cookies d'authentification.
 */
export function UI_LOCALE_COOKIE(secure: boolean): string {
  return secure ? "__Host-sv_lang" : "sv_lang";
}
