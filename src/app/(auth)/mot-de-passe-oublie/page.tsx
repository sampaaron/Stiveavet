import type { Metadata } from "next";
import Link from "next/link";

import { AuthHeading } from "../auth-heading";
import { ResetRequestForm } from "../auth-forms";

export const metadata: Metadata = { title: "Mot de passe oublié" };

export default function ForgotPasswordPage() {
  return (
    <>
      <AuthHeading title="Mot de passe oublié">
        Indiquez votre adresse : vous recevrez un lien valable 30 minutes,
        utilisable une seule fois.
      </AuthHeading>
      <ResetRequestForm />
      <p className="mt-6 text-center text-sm">
        <Link
          href="/connexion"
          className="font-semibold text-brand-ink underline-offset-2 hover:underline"
        >
          Retour à la connexion
        </Link>
      </p>
    </>
  );
}
