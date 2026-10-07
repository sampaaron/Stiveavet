import type { Metadata } from "next";

import { AuthHeading } from "../../auth-heading";
import { CodeForm } from "../../auth-forms";

export const metadata: Metadata = { title: "Code de sécurité" };

export default async function CodePage({
  searchParams,
}: PageProps<"/connexion/code">) {
  const { origine } = await searchParams;
  return (
    <>
      <AuthHeading title="Vérifions qu'il s'agit bien de vous">
        {origine === "inscription"
          ? "Pour confirmer votre adresse, saisissez le code à 6 chiffres que nous venons de vous envoyer par e-mail."
          : "Cet appareil n'est pas encore reconnu. Saisissez le code à 6 chiffres envoyé à votre adresse e-mail."}
      </AuthHeading>
      <CodeForm afterSignup={origine === "inscription"} />
    </>
  );
}
