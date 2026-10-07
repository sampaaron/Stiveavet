import type { Access } from "@/domains/facturation/rules";
import { AlertBanner } from "@/ui/alert-banner";
import { ButtonLink } from "@/ui/button";
import { formatDate } from "@/ui/format";

/**
 * Rappel de l'état de facturation sur tout l'espace cabinet : l'impayé pour qui gère la
 * facturation, la suspension des nouveaux suivis et la lecture seule pour toute l'équipe.
 */
export function BillingNotice({
  access,
  canManage,
}: {
  access: Access;
  canManage: boolean;
}) {
  const action = canManage ? (
    <ButtonLink href="/app/facturation" variant="secondary" size="sm">
      Ouvrir la facturation
    </ButtonLink>
  ) : undefined;
  let notice: { tone: "watch" | "urgent" | "info"; title: string } | null =
    null;
  if (access.kind === "grace" && canManage)
    notice = {
      tone: "watch",
      title: `Prélèvement refusé : à régulariser avant le ${formatDate(access.blockedAt)}.`,
    };
  if (access.kind === "blocked")
    notice = {
      tone: "urgent",
      title:
        "Nouveaux suivis suspendus. Les suivis en cours continuent jusqu'à leur fin.",
    };
  if (access.kind === "read_only")
    notice = {
      tone: "info",
      title: `Cabinet en lecture seule jusqu'au ${formatDate(access.until)}.`,
    };
  if (access.kind === "closed")
    notice = { tone: "info", title: "L'accès au cabinet est terminé." };
  if (!notice) return null;
  return (
    <div className="mb-6">
      <AlertBanner tone={notice.tone} title={notice.title} action={action} />
    </div>
  );
}
