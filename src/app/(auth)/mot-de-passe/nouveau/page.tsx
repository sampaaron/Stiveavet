import type { Metadata } from "next";
import Link from "next/link";

import { appText } from "@/i18n/app/server";
import { auth } from "@/server/auth";
import { AlertBanner } from "@/ui/alert-banner";

import { AuthHeading } from "../../auth-heading";
import { NewPasswordForm } from "../../auth-forms";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await appText();
  return {
    title: t.auth.reset.title,
    // Le jeton est dans l'URL : la page ne transmet jamais son adresse à un autre site.
    referrer: "no-referrer",
  };
}

export default async function NewPasswordPage({
  searchParams,
}: PageProps<"/mot-de-passe/nouveau">) {
  const { t } = await appText();
  const { jeton } = await searchParams;
  const token = typeof jeton === "string" ? jeton : undefined;
  const valid = await auth().passwordResetValid(token);

  return (
    <>
      <AuthHeading title={t.auth.reset.heading}>
        {t.auth.reset.intro}
      </AuthHeading>
      {valid && token ? (
        <NewPasswordForm token={token} />
      ) : (
        <AlertBanner
          tone="watch"
          title={t.auth.reset.invalidTitle}
          action={
            <Link
              href="/mot-de-passe-oublie"
              className="text-sm font-semibold text-brand-ink underline"
            >
              {t.auth.reset.requestNew}
            </Link>
          }
        >
          {t.auth.reset.invalidBody}
        </AlertBanner>
      )}
    </>
  );
}
