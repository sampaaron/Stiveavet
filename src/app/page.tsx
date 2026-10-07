import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { pathFor } from "@/i18n/routes";

/** Accueil : le site en anglais si le navigateur le préfère au français, sinon en français. */
export default async function Root() {
  const accepted = (await headers()).get("accept-language") ?? "";
  const preferred = accepted
    .split(",")
    .map((part) => part.trim().slice(0, 2).toLowerCase())
    .find((language) => language === "fr" || language === "en");
  redirect(pathFor("home", preferred === "en" ? "en" : "fr"));
}
