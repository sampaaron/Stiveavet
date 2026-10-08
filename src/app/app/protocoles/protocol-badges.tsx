import { CircleCheck, ShieldAlert } from "lucide-react";

import { appText } from "@/i18n/app/server";

/** Statut de validation : toujours un libellé et une icône, jamais la couleur seule. */
export async function ValidationBadge({ validated }: { validated: boolean }) {
  const { t } = await appText();
  const text = t.protocols.validationBadge;
  return validated ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-semibold text-brand-ink">
      <CircleCheck aria-hidden="true" className="size-3.5" />
      {text.validated}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-watch-soft px-2.5 py-0.5 text-xs font-semibold text-watch">
      <ShieldAlert aria-hidden="true" className="size-3.5" />
      {text.toValidate}
    </span>
  );
}
