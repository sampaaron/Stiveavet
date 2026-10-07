import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { canCreateProtocol } from "@/domains/protocoles/policies";
import { memberContext } from "@/server/authz";
import { PageHeader } from "@/ui/page-header";

import { ProtocolEditor } from "../protocol-editor";

export const metadata: Metadata = { title: "Nouveau protocole" };

export default async function NewProtocolPage() {
  const context = await memberContext();
  const scopes = [
    canCreateProtocol(context, "cabinet")
      ? { value: "cabinet" as const, label: "Le cabinet" }
      : null,
    canCreateProtocol(context, "personal")
      ? { value: "personal" as const, label: "Moi seul (protocole personnel)" }
      : null,
  ].filter((scope) => scope !== null);
  if (scopes.length === 0) notFound();

  return (
    <>
      <Link
        href="/app/protocoles"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Protocoles
      </Link>
      <PageHeader
        title="Nouveau protocole"
        description="Vous validez son contenu en l'enregistrant : étapes et signes d'alerte."
      />
      <ProtocolEditor mode="create" scopes={scopes} />
    </>
  );
}
