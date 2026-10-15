import { AlertBanner } from "@/ui/alert-banner";

import type { ActionState } from "./action-state";

/** Retour d'une action : erreur annoncée, ou confirmation discrète. */
export function ActionMessage({ state }: { state: ActionState }) {
  if (state.error) return <AlertBanner tone="urgent" title={state.error} />;
  if (state.notice)
    return (
      <p role="status" className="text-sm font-medium text-brand-ink">
        {state.notice}
      </p>
    );
  return null;
}

export const selectClasses =
  "h-11 w-full min-w-0 rounded-[var(--radius-control)] border border-line bg-surface pr-9 pl-3 text-[15px] text-ink focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand";
