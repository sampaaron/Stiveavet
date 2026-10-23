import "server-only";

import { cache } from "react";

import type { MemberContext } from "@/server/authz";
import { services } from "@/server/services";

/**
 * Décomptes des alertes sans accusé de réception, lus une fois par requête : la mise en page
 * et ses bandeaux reçoivent le même contexte (mis en cache), donc la même lecture.
 */
export const pendingAlertCounts = cache((context: MemberContext) =>
  services.alerts().pendingCounts(context),
);
