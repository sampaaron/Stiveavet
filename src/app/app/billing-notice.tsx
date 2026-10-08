import type { Access } from "@/domains/facturation/rules";
import { appText } from "@/i18n/app/server";
import { AlertBanner } from "@/ui/alert-banner";
import { ButtonLink } from "@/ui/button";
import { formatDate } from "@/ui/format";

/**
 * Rappel de l'état de facturation sur tout l'espace cabinet : l'impayé et le choix
 * d'engagement à faire (ADR 0023) pour qui gère la facturation, la suspension des nouveaux
 * suivis et la lecture seule pour toute l'équipe.
 */
export async function BillingNotice({
  access,
  canManage,
  commitmentReminder,
}: {
  access: Access;
  canManage: boolean;
  commitmentReminder: boolean;
}) {
  const { t, locale } = await appText();
  const text = t.dashboard.billing;
  const action = canManage ? (
    <ButtonLink href="/app/facturation" variant="secondary" size="sm">
      {text.open}
    </ButtonLink>
  ) : undefined;
  let notice: { tone: "watch" | "urgent" | "info"; title: string } | null =
    null;
  if (commitmentReminder && canManage)
    notice = { tone: "info", title: text.annualChoice };
  if (access.kind === "grace" && canManage)
    notice = {
      tone: "watch",
      title: text.grace(formatDate(access.blockedAt, locale)),
    };
  if (access.kind === "blocked")
    notice = {
      tone: "urgent",
      title: text.blocked,
    };
  if (access.kind === "read_only")
    notice = {
      tone: "info",
      title: text.readOnly(formatDate(access.until, locale)),
    };
  if (access.kind === "closed") notice = { tone: "info", title: text.closed };
  if (!notice) return null;
  return (
    <div className="mb-6">
      <AlertBanner tone={notice.tone} title={notice.title} action={action} />
    </div>
  );
}
