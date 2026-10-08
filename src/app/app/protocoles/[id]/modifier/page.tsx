import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { appText } from "@/i18n/app/server";
import { PageHeader } from "@/ui/page-header";

import { loadProtocol } from "../../load";
import { ProtocolEditor } from "../../protocol-editor";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await appText();
  return { title: t.protocols.editor.editMetaTitle };
}

export default async function EditProtocolPage({
  params,
}: PageProps<"/app/protocoles/[id]/modifier">) {
  const { id } = await params;
  const { t } = await appText();
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
        title={t.protocols.editor.editTitle}
        description={t.protocols.editor.editDescription(
          protocol.versions.length + 1,
        )}
      />
      <ProtocolEditor
        mode="update"
        protocolId={protocol.id}
        initial={protocol.version.content}
      />
    </>
  );
}
