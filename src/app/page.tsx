import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { preferredLocale } from "@/i18n/locales";
import { pathFor } from "@/i18n/routes";

/** Accueil : le site en anglais si le navigateur le préfère au français, sinon en français. */
export default async function Root() {
  const preferred = preferredLocale((await headers()).get("accept-language"));
  redirect(pathFor("home", preferred ?? "fr"));
}
