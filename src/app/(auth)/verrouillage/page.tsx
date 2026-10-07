import type { Metadata } from "next";
import { LockKeyhole } from "lucide-react";
import { redirect } from "next/navigation";

import { logoutAction } from "../actions";
import { currentSession } from "@/server/auth";
import { memberProfile } from "@/server/auth/profile";
import { Button } from "@/ui/button";

import { AuthHeading } from "../auth-heading";
import { UnlockForm } from "../auth-forms";

export const metadata: Metadata = { title: "Session verrouillée" };

export default async function LockPage() {
  const session = await currentSession();
  if (!session) redirect("/connexion");
  if (!session.locked) redirect("/app");
  const profile = await memberProfile(session);

  return (
    <>
      <span
        aria-hidden="true"
        className="mb-4 grid size-11 place-items-center rounded-full bg-brand-soft text-brand-ink"
      >
        <LockKeyhole className="size-5" />
      </span>
      <AuthHeading title="Session verrouillée">
        {profile.displayName}, Stivea Vet s&apos;est verrouillé après 40 minutes
        sans activité. Saisissez votre mot de passe pour reprendre.
      </AuthHeading>
      <UnlockForm />
      <form action={logoutAction} className="mt-4">
        <Button type="submit" variant="quiet" className="w-full">
          Ce n&apos;est pas moi : se déconnecter
        </Button>
      </form>
    </>
  );
}
