import Image from "next/image";
import type { ReactNode } from "react";

import { serverEnv } from "@/server/env";

/** Écrans d'accès : carte centrée sur fond clair, utilisable dès 320 px. */
export default function AuthLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-10">
      <div className="flex items-center gap-3">
        <Image
          src="/logo-stivea-vet.png"
          alt=""
          width={40}
          height={38}
          className="rounded-[10px]"
          priority
        />
        <span className="text-lg font-bold tracking-tight">
          stivea <span className="text-brand">vet</span>
        </span>
      </div>
      <div className="w-full max-w-md rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-[var(--shadow-card)] sm:p-8">
        {children}
      </div>
      {serverEnv().APP_ENV === "local" ? (
        <p className="max-w-md text-center text-xs text-ink-muted">
          Environnement local : données fictives uniquement. Les e-mails sont
          capturés par Mailpit et ne quittent pas la machine.
        </p>
      ) : null}
    </main>
  );
}
