import type { Metadata } from "next";
import Link from "next/link";

import { AuthHeading } from "../auth-heading";
import { SignupForm } from "../auth-forms";

export const metadata: Metadata = { title: "Créer un cabinet" };

export default function SignupPage() {
  return (
    <>
      <AuthHeading title="Créer votre cabinet">
        Vous serez le vétérinaire administrateur. Vous inviterez votre équipe
        ensuite, depuis l&apos;installation guidée.
      </AuthHeading>
      <SignupForm />
      <p className="mt-6 border-t border-line pt-4 text-center text-sm text-ink-muted">
        Déjà un compte ?{" "}
        <Link
          href="/connexion"
          className="font-semibold text-brand-ink underline-offset-2 hover:underline"
        >
          Se connecter
        </Link>
      </p>
    </>
  );
}
