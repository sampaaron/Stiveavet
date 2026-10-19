import { cn } from "@/ui/cn";

/** Questions dépliables, sans script : `<details>` natif, utilisable au clavier. */
export function FaqList({
  items,
  className,
}: {
  items: readonly { q: string; a: string }[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface",
        className,
      )}
    >
      {items.map((item) => (
        <details key={item.q} className="group px-5 py-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
            {item.q}
            <span
              aria-hidden="true"
              className="grid size-7 shrink-0 place-items-center rounded-full bg-canvas-subtle text-ink-muted transition-transform group-open:rotate-45"
            >
              +
            </span>
          </summary>
          <p className="mt-3 text-ink-muted">{item.a}</p>
        </details>
      ))}
    </div>
  );
}
