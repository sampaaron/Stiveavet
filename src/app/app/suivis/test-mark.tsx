import { FlaskConical } from "lucide-react";

/** Suivi test de l'installation : signalé partout où il apparaît. */
export function TestMark() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-watch-soft px-2 py-0.5 text-xs font-semibold text-watch">
      <FlaskConical aria-hidden="true" className="size-3.5" />
      Suivi test
    </span>
  );
}
