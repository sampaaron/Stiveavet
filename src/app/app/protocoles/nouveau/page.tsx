import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { canCreateProtocol } from "@/domains/protocoles/policies";
import { appText } from "@/i18n/app/server";
import { memberContext } from "@/server/authz";
import { PageHeader } from "@/ui/page-header";

import { ProtocolEditor } from "../protocol-editor";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await appText();
  return { title: t.protocols.newProtocol };
}

export default async function NewProtocolPage() {
  const { t } = await appText();
  const context = await memberContext();
  const scopes = [
    canCreateProtocol(context, "cabinet")
      ? { value: "cabinet" as const, label: t.protocols.editor.scopeCabinet }
      : null,
    canCreateProtocol(context, "personal")
      ? {
          value: "personal" as const,
          label: t.protocols.editor.scopePersonal,
        }
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
        {t.protocols.title}
      </Link>
      <PageHeader
        title={t.protocols.newProtocol}
        description={t.protocols.editor.newDescription}
      />
      <ProtocolEditor mode="create" scopes={scopes} />
    </>
  );
}
