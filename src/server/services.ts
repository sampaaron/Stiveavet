import "server-only";

import { randomBytes } from "node:crypto";

import { fakeAiGateway } from "@/adapters/ai-gateway/fake";
import { fakeBillingProvider } from "@/adapters/billing-provider/fake";
import { fakeDrVeto } from "@/adapters/drveto/fake";
import { emailSender, marketingEmailSender } from "@/adapters/email";
import { lazyObjectStorage } from "@/adapters/object-storage";
import { fakePaymentMandate } from "@/adapters/payments/fake";
import { fakeWhatsApp } from "@/adapters/whatsapp/fake";
import { agendaService } from "@/domains/agenda/captures";
import type { AgendaService } from "@/domains/agenda/captures";
import { conversationsService } from "@/domains/conversations/service";
import type { ConversationsService } from "@/domains/conversations/service";
import { demoService } from "@/domains/demo/service";
import type { DemoService } from "@/domains/demo/service";
import { teamService } from "@/domains/equipe/service";
import { mediaService } from "@/domains/fichiers/service";
import type { MediaService } from "@/domains/fichiers/service";
import { billingService } from "@/domains/facturation/service";
import type { BillingService } from "@/domains/facturation/service";
import type { TeamService } from "@/domains/equipe/service";
import { protocolsService } from "@/domains/protocoles/service";
import type { ProtocolsService } from "@/domains/protocoles/service";
import { settingsService } from "@/domains/reglages/service";
import type { SettingsService } from "@/domains/reglages/service";
import { launchService } from "@/domains/suivis/lancement";
import type { LaunchService } from "@/domains/suivis/lancement";
import { followupsService } from "@/domains/suivis/service";
import { synthesisService } from "@/domains/suivis/synthese";
import type { SynthesisService } from "@/domains/suivis/synthese";
import { todayService } from "@/domains/suivis/tableau";
import type { TodayService } from "@/domains/suivis/tableau";
import { JOB_HANDLERS, OUTBOX_ROUTES } from "@/domains/taches/registry";
import { jobsService } from "@/domains/taches/service";
import { createWorker } from "@/domains/taches/worker";
import { alertsService } from "@/domains/urgences/service";
import type { AlertsService } from "@/domains/urgences/service";
import type { JobsService } from "@/domains/taches/service";
import type { FollowupsService } from "@/domains/suivis/service";
import { appDatabase } from "@/server/db/client";
import { serverEnv } from "@/server/env";

let team: TeamService | undefined;
let followups: FollowupsService | undefined;
let protocols: ProtocolsService | undefined;
let settings: SettingsService | undefined;
let billing: BillingService | undefined;
let demo: DemoService | undefined;
let jobs: JobsService | undefined;
let launch: LaunchService | undefined;
let conversations: ConversationsService | undefined;
let alerts: AlertsService | undefined;
let media: MediaService | undefined;
let agenda: AgendaService | undefined;
let synthesis: SynthesisService | undefined;
let today: TodayService | undefined;
let simulatorWorker: ReturnType<typeof createWorker> | undefined;

declare global {
  var stiveaLocalFileLinkSecret: string | undefined;
}

/**
 * Clé des liens de lecture signés (ADR 0019) : celle de l'environnement, obligatoire hors
 * local ; en local, à défaut, une clé aléatoire propre à ce processus. Elle est gardée au
 * niveau du processus : pages et routes de fichiers sont des modules distincts.
 */
function fileLinkSecret(): string {
  const configured = serverEnv().FILE_LINK_SECRET;
  if (configured) return configured;
  globalThis.stiveaLocalFileLinkSecret ??=
    randomBytes(48).toString("base64url");
  return globalThis.stiveaLocalFileLinkSecret;
}

/** Services métier branchés sur la base applicative et l'envoi d'e-mails. */
export const services = {
  team(): TeamService {
    team ??= teamService({
      db: appDatabase(),
      email: { send: (message) => emailSender().send(message) },
      appUrl: serverEnv().APP_URL,
    });
    return team;
  },
  followups(): FollowupsService {
    followups ??= followupsService(appDatabase());
    return followups;
  },
  protocols(): ProtocolsService {
    protocols ??= protocolsService(appDatabase());
    return protocols;
  },
  /** Connecteurs simulés uniquement en phase 1 (ADR 0004). */
  settings(): SettingsService {
    settings ??= settingsService({
      db: appDatabase(),
      whatsapp: fakeWhatsApp,
      drveto: fakeDrVeto,
      payments: fakePaymentMandate,
    });
    return settings;
  },
  /** Prélèvements simulés uniquement en phase 1 (ADR 0011). */
  billing(): BillingService {
    billing ??= billingService({
      db: appDatabase(),
      provider: fakeBillingProvider(),
    });
    return billing;
  },
  /** Lancement manuel des suivis, depuis dr.veto simulé (ADR 0015). */
  launch(): LaunchService {
    launch ??= launchService({ db: appDatabase(), drveto: fakeDrVeto });
    return launch;
  },
  /** Conversation WhatsApp d'un suivi : Numa, accord, reprise en main (ADR 0016). */
  conversations(): ConversationsService {
    conversations ??= conversationsService(appDatabase());
    return conversations;
  },
  /** Alertes du triage : accusé de réception, clôture (ADR 0017). */
  alerts(): AlertsService {
    alerts ??= alertsService(appDatabase());
    return alerts;
  },
  /** Photos et vocaux : réception, liens de lecture signés, ouverture (ADR 0019). */
  media(): MediaService {
    media ??= mediaService({
      db: appDatabase(),
      storage: lazyObjectStorage,
      linkSecret: fileLinkSecret(),
    });
    return media;
  },
  /** Captures d'agenda et créneaux libres, lecture simulée (ADR 0019). */
  agenda(): AgendaService {
    agenda ??= agendaService({
      db: appDatabase(),
      storage: lazyObjectStorage,
      ai: fakeAiGateway,
    });
    return agenda;
  },
  /** Synthèse pré-consultation, rédaction simulée sous garde-fous (ADR 0020). */
  synthesis(): SynthesisService {
    synthesis ??= synthesisService({ db: appDatabase(), ai: fakeAiGateway });
    return synthesis;
  },
  /** Tableau de bord « Aujourd'hui », lu dans la base ; agenda dr.veto simulé (ADR 0020). */
  today(): TodayService {
    today ??= todayService({
      db: appDatabase(),
      followups: services.followups(),
      drveto: fakeDrVeto,
    });
    return today;
  },
  /**
   * Passage du worker déclenché par le simulateur du propriétaire, en local seulement
   * (l'appelant le vérifie) : mêmes exécutants que `pnpm worker`.
   */
  simulatorWorker() {
    simulatorWorker ??= createWorker({
      db: appDatabase(),
      workerId: "app-simulateur",
      handlers: JOB_HANDLERS,
      routes: OUTBOX_ROUTES,
    });
    return simulatorWorker;
  },
  /** Tâches en échec, relance et abandon (ADR 0014). */
  jobs(): JobsService {
    jobs ??= jobsService(appDatabase());
    return jobs;
  },
  /** Démo du site public : e-mails commerciaux séparés, vers Mailpit uniquement (ADR 0012). */
  demo(): DemoService {
    demo ??= demoService({
      db: appDatabase(),
      email: { send: (message) => marketingEmailSender().send(message) },
      appUrl: serverEnv().APP_URL,
    });
    return demo;
  },
};
