import "server-only";

import { fakeBillingProvider } from "@/adapters/billing-provider/fake";
import { fakeDrVeto } from "@/adapters/drveto/fake";
import { emailSender, marketingEmailSender } from "@/adapters/email";
import { fakePaymentMandate } from "@/adapters/payments/fake";
import { fakeWhatsApp } from "@/adapters/whatsapp/fake";
import { demoService } from "@/domains/demo/service";
import type { DemoService } from "@/domains/demo/service";
import { teamService } from "@/domains/equipe/service";
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
import { jobsService } from "@/domains/taches/service";
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
