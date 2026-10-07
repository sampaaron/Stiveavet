import type { Metadata } from "next";
import Link from "next/link";

import { auth } from "@/server/auth";
import { AlertBanner } from "@/ui/alert-banner";

import { AuthHeading } from "../../auth-heading";
import { NewPasswordForm } from "../../auth-forms";

export const metadata: Metadata = {
  title: "Nouveau mot de passe",
  // Le jeton est dans l'URL : la page ne transmet jamais son adresse à un autre site.
  referrer: "no-referrer",
};

export default async function NewPasswordPage({
  searchParams,
}: PageProps<"/mot-de-passe/nouveau">) {
  const { jeton } = await searchParams;
  const token = typeof jeton === "string" ? jeton : undefined;
  const valid = await auth().passwordResetValid(token);

  return (
    <>
      <AuthHeading title="Choisir un nouveau mot de passe">
        Toutes vos sessions ouvertes seront fermées.
      </AuthHeading>
      {valid && token ? (
        <NewPasswordForm token={token} />
      ) : (
        <AlertBanner
          tone="watch"
          title="Ce lien n'est plus valable."
          action={
            <Link
              href="/mot-de-passe-oublie"
              className="text-sm font-semibold text-brand-ink underline"
            >
              Demander un nouveau lien
            </Link>
          }
        >
          Il a expiré ou a déjà servi.
        </AlertBanner>
      )}
    </>
  );
}
