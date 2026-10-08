import type { Metadata } from "next";

import { appText } from "@/i18n/app/server";

import { AuthHeading } from "../../auth-heading";
import { CodeForm } from "../../auth-forms";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await appText();
  return { title: t.auth.code.title };
}

export default async function CodePage({
  searchParams,
}: PageProps<"/connexion/code">) {
  const { t } = await appText();
  const { origine } = await searchParams;
  return (
    <>
      <AuthHeading title={t.auth.code.heading}>
        {origine === "inscription"
          ? t.auth.code.introSignup
          : t.auth.code.introDevice}
      </AuthHeading>
      <CodeForm afterSignup={origine === "inscription"} />
    </>
  );
}
