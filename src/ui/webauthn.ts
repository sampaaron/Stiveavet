import { browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** Le navigateur sait-il utiliser une clé d'accès ? Faux au rendu serveur (ADR 0050). */
export function useWebAuthnSupport() {
  return useSyncExternalStore(subscribe, browserSupportsWebAuthn, () => false);
}
