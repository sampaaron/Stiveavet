import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { appText } from "@/i18n/app/server";
import { currentSession } from "@/server/auth";
import { AlertBanner } from "@/ui/alert-banner";

import { AuthHeading } from "../auth-heading";
import { LoginForm } from "../auth-forms";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await appText();
  return { title: t.auth.login.title };
}

export default async function LoginPage({
  searchParams,
}: PageProps<"/connexion">) {
  const session = await currentSession();
  if (session) redirect(session.locked ? "/verrouillage" : "/app");

  const { t } = await appText();
  // Valeurs du paramètre `raison` posées par les redirections des actions d'accès.
  const reasons: Record<string, string> = {
    deconnexion: t.auth.login.reasons.signedOut,
    session: t.auth.login.reasons.session,
    invitation: t.auth.login.reasons.invitation,
    "mot-de-passe": t.auth.login.reasons.passwordChanged,
  };
  const { raison } = await searchParams;
  const reason =
    typeof raison === "string" && Object.hasOwn(reasons, raison)
      ? reasons[raison]
      : undefined;
  return (
    <>
      <AuthHeading title={t.auth.login.heading}>
        {t.auth.login.intro}
      </AuthHeading>
      {reason ? (
        <div className="mb-4">
          <AlertBanner tone="info" title={reason} />
        </div>
      ) : null}
      <LoginForm />
      <p className="mt-6 border-t border-line pt-4 text-center text-sm text-ink-muted">
        {t.auth.login.newPractice}{" "}
        <Link
          href="/inscription"
          className="font-semibold text-brand-ink underline-offset-2 hover:underline"
        >
          {t.auth.login.createAccount}
        </Link>
      </p>
    </>
  );
}
