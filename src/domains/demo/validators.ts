import { z } from "zod";

import { PLAIN_NAME } from "@/domains/auth/validators";
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
    .max(160, "cabinet_long")
    // Un nom, pas un message : ni lien, ni adresse, ni caractère invisible ou de contrôle.
    .regex(PLAIN_NAME, "cabinet_chars"),
  // 4 signifie « plus de trois vétérinaires ».
  vetCount: z.enum(["1", "2", "3", "4"], "vets").transform(Number),
  locale: z.enum(LOCALES),
});

export type DemoRequest = z.infer<typeof demoRequestInput>;
