import type { ComponentProps, ReactNode } from "react";
import { useId } from "react";

import { cn } from "./cn";

type TextFieldProps = Omit<ComponentProps<"input">, "id"> & {
  label: string;
  hint?: ReactNode;
  /** Messages d'erreur du serveur ; reliés au champ pour les lecteurs d'écran. */
  errors?: readonly string[];
};

/** Champ de formulaire : libellé visible, aide et erreurs annoncées, focus marqué. */
export function TextField({
  label,
  hint,
  errors,
  className,
  ...props
}: TextFieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-aide` : undefined;
  const errorId = errors?.length ? `${id}-erreur` : undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={errors?.length ? true : undefined}
        aria-describedby={
          [hintId, errorId].filter(Boolean).join(" ") || undefined
        }
        className={cn(
          "h-11 rounded-[var(--radius-control)] border border-line bg-surface px-3 text-[15px] text-ink",
          "placeholder:text-ink-muted focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand",
          errors?.length ? "border-urgent" : undefined,
        )}
        {...props}
      />
      {hint ? (
        <p id={hintId} className="text-[13px] text-ink-muted">
          {hint}
        </p>
      ) : null}
      {errors?.length ? (
        <ul id={errorId} className="text-[13px] font-medium text-urgent">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
