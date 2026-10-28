import { isIP } from "node:net";

/**
 * Adresse IP du client, lue dans `X-Forwarded-For` seulement derrière un proxy de confiance
 * (`TRUST_PROXY`) : sinon l'en-tête est falsifiable et l'IP est ignorée. Le répartiteur
 * ajoute l'adresse du client en dernier ; c'est la seule valeur fiable.
 */
export function clientIp(
  forwardedFor: string | null,
  trustProxy: boolean,
): string | null {
  if (!trustProxy) return null;
  const last = forwardedFor?.split(",").at(-1)?.trim();
  return last && isIP(last) ? last : null;
}
