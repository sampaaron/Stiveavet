import type { Metadata } from "next";
import { LockKeyhole } from "lucide-react";
import { redirect } from "next/navigation";

import { logoutAction } from "../actions";
import { appText } from "@/i18n/app/server";
import { currentSession } from "@/server/auth";
import { memberProfile } from "@/server/auth/profile";
import { Button } from "@/ui/button";

import { AuthHeading } from "../auth-heading";
import { UnlockForm } from "../auth-forms";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await appText();
  return { title: t.auth.lock.title };
}

export default async function LockPage() {
  const session = await currentSession();
  if (!session) redirect("/connexion");
  if (!session.locked) redirect("/app");
  const [profile, { t }] = await Promise.all([
    memberProfile(session),
    appText(),
  ]);

  return (
    <>
      <span
        aria-hidden="true"
        className="mb-4 grid size-11 place-items-center rounded-full bg-brand-soft text-brand-ink"
      >
        <LockKeyhole className="size-5" />
      </span>
      <AuthHeading title={t.auth.lock.title}>
        {t.auth.lock.intro(profile.displayName)}
      </AuthHeading>
      <UnlockForm />
      <form action={logoutAction} className="mt-4">
        <Button type="submit" variant="quiet" className="w-full">
          {t.auth.lock.notMe}
        </Button>
      </form>
    </>
  );
}
