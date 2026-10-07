import { z } from "zod";

import { LOCALES } from "@/i18n/locales";

/** Demande de démo : e-mail, nom du cabinet, nombre de vétérinaires (cahier des charges §13). */
export const demoRequestInput = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, "too_long")
    .pipe(z.email("email")),
  cabinetName: z
    .string()
    .trim()
    .min(2, "cabinet_short")
    .max(160, "cabinet_long"),
  // 4 signifie « plus de trois vétérinaires ».
  vetCount: z.enum(["1", "2", "3", "4"], "vets").transform(Number),
  locale: z.enum(LOCALES),
});

export type DemoRequest = z.infer<typeof demoRequestInput>;
