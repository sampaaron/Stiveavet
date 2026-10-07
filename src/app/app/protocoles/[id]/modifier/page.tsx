import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/ui/page-header";

import { loadProtocol } from "../../load";
import { ProtocolEditor } from "../../protocol-editor";

export const metadata: Metadata = { title: "Modifier un protocole" };

export default async function EditProtocolPage({
  params,
}: PageProps<"/app/protocoles/[id]/modifier">) {
  const { id } = await params;
  const protocol = await loadProtocol(id);
  if (!protocol.can.edit) notFound();

  return (
    <>
      <Link
        href={`/app/protocoles/${protocol.id}`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {protocol.version.content.name}
      </Link>
      <PageHeader
        title="Modifier le protocole"
        description={`Enregistrer crée la version ${protocol.versions.length + 1}. Les suivis déjà lancés gardent la leur.`}
      />
      <ProtocolEditor
        mode="update"
        protocolId={protocol.id}
        initial={protocol.version.content}
      />
    </>
  );
}
