import { FlaskConical } from "lucide-react";

import { appText } from "@/i18n/app/server";

/** Suivi test de l'installation : signalé partout où il apparaît. */
export async function TestMark() {
  const { t } = await appText();
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-watch-soft px-2 py-0.5 text-xs font-semibold text-watch">
      <FlaskConical aria-hidden="true" className="size-3.5" />
      {t.followups.testMark}
    </span>
  );
}
