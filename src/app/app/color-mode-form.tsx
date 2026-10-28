import { Check, Monitor, Moon, Sun } from "lucide-react";

import type { AppDictionary } from "@/i18n/app/types";
import { SectionCard } from "@/ui/card";
import { cn } from "@/ui/cn";
import { COLOR_MODES } from "@/ui/color-mode";
import type { ColorMode } from "@/ui/color-mode";

import { chooseColorModeAction } from "../color-mode-actions";

const ICONS = { light: Sun, dark: Moon, system: Monitor } as const;

/**
 * Choix du mode d'affichage (ADR 0052), dans les Réglages et dans Mon compte. Un bouton par
 * mode : le choix s'enregistre d'un clic, même sans JavaScript.
 */
export function ColorModeCard({
  t,
  current,
  back,
}: {
  t: AppDictionary;
  current: ColorMode;
  back: "/app/reglages" | "/app/compte";
}) {
  const text = t.ui.colorMode;
  return (
    <SectionCard
      id="affichage"
      title={text.title}
      description={text.description}
    >
      <form action={chooseColorModeAction}>
        <input type="hidden" name="back" value={back} />
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">{text.legend}</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {COLOR_MODES.map((mode) => {
              const Icon = ICONS[mode];
              const selected = mode === current;
              return (
                <button
                  key={mode}
                  type="submit"
                  name="mode"
                  value={mode}
                  aria-pressed={selected}
                  className={cn(
                    "flex min-h-11 items-start gap-3 rounded-[var(--radius-control)] border p-3.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                    selected
                      ? "border-brand bg-brand-soft"
                      : "border-line bg-surface hover:border-brand/50 hover:bg-canvas-subtle",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "grid size-9 shrink-0 place-items-center rounded-full",
                      selected
                        ? "bg-brand text-on-strong"
                        : "bg-canvas-subtle text-ink-muted",
                    )}
                  >
                    <Icon className="size-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 font-semibold">
                      {text.options[mode]}
                      {selected ? (
                        <Check
                          aria-hidden="true"
                          className="size-4 text-brand-ink"
                        />
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-sm text-ink-muted">
                      {text.hints[mode]}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>
      </form>
    </SectionCard>
  );
}
