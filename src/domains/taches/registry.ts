import type { AiGateway } from "@/adapters/ai-gateway/types";
import { workerEmailSender } from "@/adapters/email/worker";
import { lazyObjectStorage } from "@/adapters/object-storage";
import { conversationHandlers } from "@/domains/conversations/service";
import type { BillingProvider } from "@/adapters/billing-provider/types";
import { billingHandlers } from "@/domains/facturation/offre-annuelle";
import {
  billingSyncHandlers,
  planBillingSyncs,
} from "@/domains/facturation/service";
import { billingProviders } from "@/domains/facturation/stripe";
import { mediaHandlers } from "@/domains/fichiers/service";
import {
  planRetentionSweeps,
  retentionHandlers,
} from "@/domains/suivis/conservation";
import { followupEndHandlers } from "@/domains/suivis/rappels";
import {
  alertRecapHandlers,
  planAlertRecaps,
} from "@/domains/urgences/recapitulatif";
import { alertHandlers } from "@/domains/urgences/service";
import type { WhatsAppProvider } from "@/domains/whatsapp/connexion";
import { sendHandlers } from "@/domains/whatsapp/envoi";
import { failureEmailHandlers } from "@/domains/whatsapp/echecs";
import { mediaDownloadHandlers } from "@/domains/whatsapp/medias";

import type {
  AnyJobHandler,
  DeadJobHandler,
  JobPlanner,
  OutboxRoute,
} from "./worker";

/**
 * Exécutants des tâches et routes de l'outbox, par type. Le worker ne prend que les tâches
 * dont il connaît le type : une tâche d'un type pas encore livré attend sans échouer.
 * IA simulée ou réelle selon la configuration (ADR 0016, ADR 0026) ; rappels et fin du suivi automatisé au lot 15 (ADR 0018) ;
 * transcription, analyse photo et suppression des fichiers au lot 16 (ADR 0019), sur le
 * stockage objet local ; conservation des données au lot 17 (ADR 0020) ; offre d'engagement
 * annuel au lot 20 (ADR 0023) ; envois WhatsApp, simulés ou par l'API de Meta selon la
 * configuration, au lot 21 (ADR 0024) ; photos et vocaux reçus par WhatsApp au lot 22 (ADR 0025) ;
 * échéances et prélèvements quotidiens, hors des pages (ADR 0040) ; récapitulatif des alertes
 * à 12 h et à 18 h (ADR 0049).
 */
export function jobRegistry(deps: {
  whatsapp: WhatsAppProvider;
  ai: AiGateway;
  /** Adresse publique de l'application, validée par la configuration de l'appelant. */
  appUrl: string;
  /** Prélèvements : par défaut ceux de la configuration (simulés en local, Stripe sinon). */
  billing?: BillingProvider;
}): {
  handlers: Readonly<Record<string, AnyJobHandler>>;
  dead: Readonly<Record<string, DeadJobHandler>>;
} {
  const email = workerEmailSender();
  const sends = sendHandlers({ whatsapp: deps.whatsapp });
  const alerts = alertHandlers({ whatsapp: deps.whatsapp });
  const downloads = mediaDownloadHandlers({
    whatsapp: deps.whatsapp,
    storage: lazyObjectStorage,
  });
  return {
    handlers: {
      ...conversationHandlers({ whatsapp: deps.whatsapp, ai: deps.ai }),
      ...sends.handlers,
      ...alerts.handlers,
      ...downloads.handlers,
      ...failureEmailHandlers({ email, appUrl: deps.appUrl }),
      ...alertRecapHandlers({ email, appUrl: deps.appUrl }),
      ...followupEndHandlers(),
      ...mediaHandlers({ storage: lazyObjectStorage, ai: deps.ai }),
      ...retentionHandlers({ storage: lazyObjectStorage }),
      ...billingHandlers({ email, appUrl: deps.appUrl }),
      ...billingSyncHandlers({
        provider: deps.billing ?? billingProviders().billing,
      }),
    },
    dead: { ...sends.dead, ...alerts.dead, ...downloads.dead },
  };
}

/** Tâches périodiques, inscrites par le worker de `pnpm worker` (pas par le simulateur). */
export const JOB_PLANNERS: readonly JobPlanner[] = [
  planRetentionSweeps,
  planBillingSyncs,
  planAlertRecaps,
];

export const OUTBOX_ROUTES: Readonly<Record<string, OutboxRoute>> = {};
