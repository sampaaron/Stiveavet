import "server-only";

import { emailSender } from "@/adapters/email";
import { teamService } from "@/domains/equipe/service";
import type { TeamService } from "@/domains/equipe/service";
import { followupsService } from "@/domains/suivis/service";
import type { FollowupsService } from "@/domains/suivis/service";
import { appDatabase } from "@/server/db/client";
import { serverEnv } from "@/server/env";

let team: TeamService | undefined;
let followups: FollowupsService | undefined;

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
};
