import type { Metadata } from "next";

import { previewInvitation } from "@/domains/equipe/service";
import { appText } from "@/i18n/app/server";
import { appDatabase } from "@/server/db/client";
import { AlertBanner } from "@/ui/alert-banner";

import { AuthHeading } from "../auth-heading";
import { InvitationForm } from "../auth-forms";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await appText();
  return {
    title: t.auth.invitation.title,
    // Le jeton est dans l'URL : la page ne transmet jamais son adresse à un autre site.
    referrer: "no-referrer",
  };
}

export default async function InvitationPage({
  searchParams,
}: PageProps<"/invitation">) {
  const { t } = await appText();
  const { jeton } = await searchParams;
  const token = typeof jeton === "string" ? jeton : undefined;
  const invitation = await previewInvitation(appDatabase(), token);

  if (!invitation || !token)
    return (
      <>
        <AuthHeading title={t.auth.invitation.title} />
        <AlertBanner tone="watch" title={t.auth.invitation.invalidTitle}>
          {t.auth.invitation.invalidBody}
        </AlertBanner>
      </>
    );

  return (
    <>
      <AuthHeading
        title={t.auth.invitation.heading(invitation.organizationName)}
      >
        {t.auth.invitation.intro(t.labels.roles[invitation.role].toLowerCase())}
      </AuthHeading>
      {invitation.emailRegistered ? (
        <AlertBanner tone="watch" title={t.auth.invitation.registeredTitle}>
          {t.auth.invitation.registeredBody}
        </AlertBanner>
      ) : (
        <InvitationForm
          token={token}
          email={invitation.email}
          displayName={invitation.displayName}
        />
      )}
    </>
  );
}
