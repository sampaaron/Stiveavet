import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { currentSession } from "@/server/auth";
import { AlertBanner } from "@/ui/alert-banner";

import { AuthHeading } from "../auth-heading";
import { LoginForm } from "../auth-forms";

export const metadata: Metadata = { title: "Connexion" };

const reasons: Record<string, string> = {
  deconnexion: "Vous êtes déconnecté.",
  session: "Votre session a été fermée. Reconnectez-vous.",
  "mot-de-passe":
    "Mot de passe modifié. Toutes vos sessions ont été fermées : connectez-vous avec le nouveau.",
};

export default async function LoginPage({
  searchParams,
}: PageProps<"/connexion">) {
  const session = await currentSession();
  if (session) redirect(session.locked ? "/verrouillage" : "/app");

  const { raison } = await searchParams;
  const reason = typeof raison === "string" ? reasons[raison] : undefined;
  return (
    <>
      <AuthHeading title="Connexion à votre cabinet">
        Les vétérinaires reçoivent un code par e-mail lors d&apos;une connexion
        depuis un nouvel appareil.
      </AuthHeading>
      {reason ? (
        <div className="mb-4">
          <AlertBanner tone="info" title={reason} />
        </div>
      ) : null}
      <LoginForm />
      <p className="mt-6 border-t border-line pt-4 text-center text-sm text-ink-muted">
        Nouveau cabinet ?{" "}
        <Link
          href="/inscription"
          className="font-semibold text-brand-ink underline-offset-2 hover:underline"
        >
          Créer un compte
        </Link>
      </p>
    </>
  );
}
