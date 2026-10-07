import type { Metadata } from "next";

import { ROLE_LABELS } from "@/domains/equipe/permissions";
import { previewInvitation } from "@/domains/equipe/service";
import { appDatabase } from "@/server/db/client";
import { AlertBanner } from "@/ui/alert-banner";

import { AuthHeading } from "../auth-heading";
import { InvitationForm } from "../auth-forms";

export const metadata: Metadata = {
  title: "Rejoindre un cabinet",
  // Le jeton est dans l'URL : la page ne transmet jamais son adresse à un autre site.
  referrer: "no-referrer",
};

export default async function InvitationPage({
  searchParams,
}: PageProps<"/invitation">) {
  const { jeton } = await searchParams;
  const token = typeof jeton === "string" ? jeton : undefined;
  const invitation = await previewInvitation(appDatabase(), token);

  if (!invitation || !token)
    return (
      <>
        <AuthHeading title="Rejoindre un cabinet" />
        <AlertBanner tone="watch" title="Cette invitation n'est plus valable.">
          Elle a expiré, a été annulée ou a déjà servi. Demandez une nouvelle
          invitation au cabinet.
        </AlertBanner>
      </>
    );

  return (
    <>
      <AuthHeading title={`Rejoindre ${invitation.organizationName}`}>
        Vous êtes invité comme {ROLE_LABELS[invitation.role].toLowerCase()}.
        Choisissez votre mot de passe pour créer votre compte.
      </AuthHeading>
      {invitation.emailRegistered ? (
        <AlertBanner
          tone="watch"
          title="Cette adresse a déjà un compte Stivea Vet."
        >
          Un compte ne peut appartenir qu&apos;à un seul cabinet pour
          l&apos;instant. Demandez au cabinet de vous inviter avec une autre
          adresse.
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
