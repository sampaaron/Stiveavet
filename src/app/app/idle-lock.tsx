"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { keepAliveAction, lockAction } from "../(auth)/actions";

const ACTIVITY_EVENTS = [
  "pointerdown",
  "keydown",
  "wheel",
  "touchstart",
] as const;
// Une activité dans la page (saisie longue sans requête) prévient le serveur au plus toutes les 5 min.
const KEEP_ALIVE_MS = 5 * 60_000;

/**
 * Verrouillage côté navigateur, en complément du contrôle serveur (qui fait foi) :
 * après `idleMinutes` sans interaction, la session est verrouillée et l'écran masqué.
 */
export function IdleLock({ idleMinutes }: { idleMinutes: number }) {
  const router = useRouter();

  useEffect(() => {
    let lastActivity = Date.now();
    let lastKeepAlive = Date.now();

    const onActivity = () => {
      lastActivity = Date.now();
      if (lastActivity - lastKeepAlive > KEEP_ALIVE_MS) {
        lastKeepAlive = lastActivity;
        void keepAliveAction().then((state) => {
          if (state === "locked") router.replace("/verrouillage");
          if (state === "signed_out")
            router.replace("/connexion?raison=session");
        });
      }
    };
    for (const name of ACTIVITY_EVENTS)
      window.addEventListener(name, onActivity, { passive: true });

    const timer = window.setInterval(() => {
      if (Date.now() - lastActivity >= idleMinutes * 60_000) {
        window.clearInterval(timer);
        void lockAction();
      }
    }, 15_000);

    return () => {
      window.clearInterval(timer);
      for (const name of ACTIVITY_EVENTS)
        window.removeEventListener(name, onActivity);
    };
  }, [idleMinutes, router]);

  return null;
}
