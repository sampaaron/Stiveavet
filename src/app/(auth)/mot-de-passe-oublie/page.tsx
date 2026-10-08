import type { Metadata } from "next";
import Link from "next/link";

import { appText } from "@/i18n/app/server";

import { AuthHeading } from "../auth-heading";
import { ResetRequestForm } from "../auth-forms";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await appText();
  return { title: t.auth.forgot.title };
}

export default async function ForgotPasswordPage() {
  const { t } = await appText();
  return (
    <>
      <AuthHeading title={t.auth.forgot.title}>
        {t.auth.forgot.intro}
      </AuthHeading>
      <ResetRequestForm />
      <p className="mt-6 text-center text-sm">
        <Link
          href="/connexion"
          className="font-semibold text-brand-ink underline-offset-2 hover:underline"
        >
          {t.auth.forgot.backToLogin}
        </Link>
      </p>
    </>
  );
}
