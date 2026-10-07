import { CircleCheck, ShieldAlert } from "lucide-react";

/** Statut de validation : toujours un libellé et une icône, jamais la couleur seule. */
export function ValidationBadge({ validated }: { validated: boolean }) {
  return validated ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-semibold text-brand-ink">
      <CircleCheck aria-hidden="true" className="size-3.5" />
      Validé
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-watch-soft px-2.5 py-0.5 text-xs font-semibold text-watch">
      <ShieldAlert aria-hidden="true" className="size-3.5" />À valider par un
      vétérinaire
    </span>
  );
}
