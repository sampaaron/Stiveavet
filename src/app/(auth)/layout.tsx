import Image from "next/image";
import type { ReactNode } from "react";

import { appText } from "@/i18n/app/server";
import { serverEnv } from "@/server/env";

import { LanguageSwitch } from "../language-switch";

/** Écrans d'accès : carte centrée sur fond clair, utilisable dès 320 px. */
export default async function AuthLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const { t } = await appText();
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
      {/* Bascule de langue discrète, sous la carte (ADR 0022). */}
      <LanguageSwitch className="-mt-2" />
      {serverEnv().APP_ENV === "local" ? (
        <p className="max-w-md text-center text-xs text-ink-muted">
          {t.auth.localNotice}
        </p>
      ) : null}
    </main>
  );
}
