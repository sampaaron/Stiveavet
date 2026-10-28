import { ChevronDown, LockKeyhole, MessageSquareQuote } from "lucide-react";
import type { Metadata } from "next";

import { appText } from "@/i18n/app/server";
import { requirePermission } from "@/server/authz";
import { services } from "@/server/services";
import { Card, SectionCard } from "@/ui/card";
import { formatRelativeMoment } from "@/ui/format";
import { PageHeader } from "@/ui/page-header";
import { EmptyState } from "@/ui/states";

import { RemoveTemplateButton, TemplateForm } from "./template-forms";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await appText();
  return { title: t.hub.replies.title };
}

/**
 * Réponses prêtes (ADR 0048), sous Protocoles : les modèles de réponse du cabinet. Lus par
 * qui répond aux propriétaires ; écrits par l'administrateur du cabinet.
 */
export default async function RepliesPage({
  searchParams,
}: PageProps<"/app/reponses">) {
  const context = await requirePermission(
    "owner_messages.reply",
    "organization.settings",
  );
  const canManage = context.permissions.has("organization.settings");
  const [{ t, locale }, templates, { fait }] = await Promise.all([
    appText(),
    services.replyTemplates().list(context),
    searchParams,
  ]);
  const text = t.hub.replies;
  const done =
    fait === "ajout"
      ? text.done.added
      : fait === "enregistre"
        ? text.done.saved
        : fait === "suppression"
          ? text.done.removed
          : undefined;
  const now = new Date();

  const list = (
    <SectionCard title={text.count(templates.length)}>
      {templates.length === 0 ? (
        <EmptyState
          title={text.empty.title}
          description={canManage ? text.empty.description : text.empty.readOnly}
        />
      ) : (
        <ul aria-label={text.title} className="grid divide-y divide-line">
          {templates.map((template) => (
            <li
              key={template.id}
              className="grid gap-2 py-4 first:pt-0 last:pb-0"
            >
              <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                <span
                  aria-hidden="true"
                  className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-control)] bg-[var(--section-soft,var(--color-brand-soft))] text-[var(--section-accent,var(--color-brand))]"
                >
                  <MessageSquareQuote className="size-5" />
                </span>
                <div className="min-w-0 flex-1 basis-56">
                  <p className="font-semibold break-words">{template.title}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
                    <span className="rounded-full bg-canvas-subtle px-2 py-0.5 font-semibold text-ink">
                      {text.languages[template.language]}
                    </span>
                    <span>
                      {text.updated(
                        formatRelativeMoment(template.updatedAt, now, locale),
                        template.createdBy,
                      )}
                    </span>
                  </p>
                </div>
                {canManage ? (
                  <RemoveTemplateButton
                    templateId={template.id}
                    title={template.title}
                  />
                ) : null}
              </div>
              <p className="text-sm break-words whitespace-pre-line text-ink-muted">
                {template.body}
              </p>
              {canManage ? (
                <details className="group">
                  <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-brand-ink [&::-webkit-details-marker]:hidden">
                    {text.form.edit}
                    <span className="sr-only">{template.title}</span>
                    <ChevronDown
                      aria-hidden="true"
                      className="size-4 transition-transform group-open:rotate-180"
                    />
                  </summary>
                  <div className="mt-3">
                    <TemplateForm template={template} />
                  </div>
                </details>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );

  return (
    <>
      <PageHeader title={text.title} description={text.description} />
      {done ? (
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
              {text.form.addTitle}
            </h2>
            <TemplateForm />
          </Card>
        </div>
      ) : (
        list
      )}
    </>
  );
}
