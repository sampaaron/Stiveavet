"use client";

import { LAUNCH_SURCHARGE_CENTS } from "@/domains/facturation/rules";
import { useAppText, useLocale } from "@/i18n/app/client";
import { formatPrice } from "@/i18n/locales";

/** Compteur de suivis actifs simultanés par rapport aux places incluses dans l'abonnement. */
export function CapacityMeter({
  used,
  included,
}: {
  used: number;
  included: number;
}) {
  const t = useAppText().ui.capacity;
  const locale = useLocale();
  const ratio = Math.min(used / included, 1);
  const remaining = Math.max(included - used, 0);
  return (
    <div>
      <div
        role="meter"
        aria-label={t.label}
        aria-valuemin={0}
        aria-valuemax={included}
        aria-valuenow={used}
        aria-valuetext={t.valueText(used, included)}
        className="h-2 overflow-hidden rounded-full bg-canvas-subtle"
      >
        <div
          className="h-full rounded-full bg-brand"
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      <p className="mt-2 text-sm text-ink-muted">
        {remaining > 0
          ? t.remaining(remaining)
          : t.full(formatPrice(LAUNCH_SURCHARGE_CENTS, locale))}
      </p>
    </div>
  );
}
