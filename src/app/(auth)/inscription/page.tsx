import type { Metadata } from "next";
import Link from "next/link";

import { appText } from "@/i18n/app/server";

import { AuthHeading } from "../auth-heading";
import { SignupForm } from "../auth-forms";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await appText();
  return { title: t.auth.signup.title };
}

export default async function SignupPage() {
  const { t } = await appText();
  return (
    <>
      <AuthHeading title={t.auth.signup.heading}>
        {t.auth.signup.intro}
      </AuthHeading>
      <SignupForm />
      <p className="mt-6 border-t border-line pt-4 text-center text-sm text-ink-muted">
        {t.auth.signup.haveAccount}{" "}
        <Link
          href="/connexion"
          className="font-semibold text-brand-ink underline-offset-2 hover:underline"
        >
          {t.auth.signup.signIn}
        </Link>
      </p>
    </>
  );
}
