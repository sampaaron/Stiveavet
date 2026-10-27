import {
  Download,
  ExternalLink,
  FileText,
  Image,
  LockKeyhole,
} from "lucide-react";
import type { Metadata } from "next";

import { DOCUMENT_MANAGER } from "@/domains/documents/service";
import type { DocumentView } from "@/domains/documents/service";
import { appText } from "@/i18n/app/server";
import { requirePermission } from "@/server/authz";
import { services } from "@/server/services";
import { buttonClasses } from "@/ui/button";
import { Card, SectionCard } from "@/ui/card";
import { formatFileSize, formatRelativeMoment } from "@/ui/format";
import { PageHeader } from "@/ui/page-header";
import { EmptyState } from "@/ui/states";

import { AddDocumentForm, RemoveDocumentButton } from "./document-forms";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await appText();
  return { title: t.hub.documents.title };
}

const TYPE_LABELS: Record<DocumentView["contentType"], string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPEG",
  "image/png": "PNG",
  "image/webp": "WebP",
};

/**
 * Documents du cabinet (ADR 0045), sous Protocoles : la bibliothèque de l'équipe. Lue par
 * ceux qui voient les protocoles ; seul qui gère les protocoles ajoute et supprime.
 */
export default async function DocumentsPage({
  searchParams,
}: PageProps<"/app/documents">) {
  const context = await requirePermission(
    "protocols.manage",
    "protocols.create_own",
    "followups.launch",
  );
  const canManage = context.permissions.has(DOCUMENT_MANAGER);
  const [{ t, locale }, documents, { fait, lien }] = await Promise.all([
    appText(),
    services.documents().list(context),
    searchParams,
  ]);
  const text = t.hub.documents;
  const done =
    fait === "ajout"
      ? text.done.added
      : fait === "suppression"
        ? text.done.removed
        : undefined;
  const now = new Date();

  const list = (
    <SectionCard title={text.count(documents.length)}>
      {documents.length === 0 ? (
        <EmptyState
          title={text.empty.title}
          description={canManage ? text.empty.description : text.empty.readOnly}
        />
      ) : (
        <ul className="grid divide-y divide-line">
          {documents.map((document) => {
            const pdf = document.contentType === "application/pdf";
            const Icon = pdf ? FileText : Image;
            return (
              <li
                key={document.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-3 py-4 first:pt-0 last:pb-0"
              >
                <span
                  aria-hidden="true"
                  className="grid size-11 shrink-0 place-items-center rounded-[var(--radius-control)] bg-[var(--section-soft,var(--color-brand-soft))] text-[var(--section-accent,var(--color-brand))]"
                >
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0 flex-1 basis-56">
                  <p className="font-semibold break-words">{document.title}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
                    <span className="rounded-full bg-canvas-subtle px-2 py-0.5 font-semibold text-ink">
                      {text.categories[document.category]}
                    </span>
                    <span>
                      {TYPE_LABELS[document.contentType]} ·{" "}
                      {formatFileSize(document.byteSize, locale)}
                    </span>
                    <span>
                      {text.added(
                        formatRelativeMoment(document.createdAt, now, locale),
                        document.addedBy,
                      )}
                    </span>
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {document.link ? (
                    // Lien simple : le fichier vient d'une route, pas du routeur de l'application.
                    <a
                      href={document.link.url}
                      className={buttonClasses({
                        variant: "secondary",
                        size: "sm",
                      })}
                      aria-label={(pdf ? text.downloadLabel : text.openLabel)(
                        document.title,
                      )}
                      {...(pdf
                        ? {}
                        : { target: "_blank", rel: "noopener noreferrer" })}
                    >
                      {pdf ? (
                        <Download aria-hidden="true" className="size-4" />
                      ) : (
                        <ExternalLink aria-hidden="true" className="size-4" />
                      )}
                      {pdf ? text.download : text.open}
                    </a>
                  ) : (
                    <span className="text-xs text-ink-muted">
                      {text.missing}
                    </span>
                  )}
                  {canManage ? (
                    <RemoveDocumentButton
                      documentId={document.id}
                      title={document.title}
                    />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );

  return (
    <>
      <PageHeader title={text.title} description={text.description} />
      {lien === "expire" ? (
        <p
          role="status"
          className="mb-4 rounded-[var(--radius-card)] bg-watch-soft px-4 py-3 text-sm font-medium text-watch"
        >
          {text.expired}
        </p>
      ) : done ? (
        <p
          role="status"
          className="mb-4 rounded-[var(--radius-card)] bg-brand-soft px-4 py-3 text-sm font-medium text-brand-ink"
        >
          {done}
        </p>
      ) : null}
      <p className="mb-6 flex items-start gap-2 text-sm text-ink-muted">
        <LockKeyhole
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-brand"
        />
        {text.notice}
      </p>
      {canManage ? (
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          {list}
          <Card className="p-5 sm:p-6">
            <h2 className="mb-4 text-[17px] font-bold tracking-tight">
              {text.upload.title}
            </h2>
            <AddDocumentForm />
          </Card>
        </div>
      ) : (
        list
      )}
    </>
  );
}
