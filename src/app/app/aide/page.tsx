import { redirect } from "next/navigation";

import { appText } from "@/i18n/app/server";
import { pathFor } from "@/i18n/routes";

/** Le centre d'aide est celui du site public, dans la langue de l'espace cabinet. */
export default async function HelpPage() {
  const { locale } = await appText();
  redirect(pathFor("help", locale));
}
