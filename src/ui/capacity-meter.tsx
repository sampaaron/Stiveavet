/** Compteur de suivis actifs simultanés par rapport aux places incluses dans l'abonnement. */
export function CapacityMeter({
  used,
  included,
}: {
  used: number;
  included: number;
}) {
  const ratio = Math.min(used / included, 1);
  const remaining = Math.max(included - used, 0);
  return (
    <div>
      <div
        role="meter"
        aria-label="Suivis actifs"
        aria-valuemin={0}
        aria-valuemax={included}
        aria-valuenow={used}
        aria-valuetext={`${used} suivis actifs sur ${included} inclus`}
        className="h-2 overflow-hidden rounded-full bg-canvas-subtle"
      >
        <div
          className="h-full rounded-full bg-brand"
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      <p className="mt-2 text-sm text-ink-muted">
        {remaining > 0
          ? `${remaining} place${remaining > 1 ? "s" : ""} incluse${remaining > 1 ? "s" : ""} restante${remaining > 1 ? "s" : ""}`
          : "Places incluses utilisées : chaque nouveau suivi est facturé 2,50 € HT"}
      </p>
    </div>
  );
}
