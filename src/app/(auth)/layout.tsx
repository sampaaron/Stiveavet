import Image from "next/image";
import type { ReactNode } from "react";

import { appText } from "@/i18n/app/server";
import { serverEnv } from "@/server/env";

import { LanguageSwitch } from "../language-switch";

/**
 * Écrans d'accès : panneau de marque à gauche sur grand écran (ADR 0033), carte du
 * formulaire à droite, utilisable dès 320 px.
 */
export default async function AuthLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const { t } = await appText();
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside
        aria-hidden="true"
        className="relative isolate hidden overflow-hidden bg-[#08130f] p-12 text-white lg:flex lg:flex-col lg:justify-between"
      >
        <span className="absolute -top-32 -left-24 -z-10 size-[30rem] rounded-full bg-[conic-gradient(from_180deg,#8ce8c3,#087a54,#5b4fe0,#8ce8c3)] opacity-35 blur-3xl" />
        <span className="absolute -right-24 -bottom-40 -z-10 size-[26rem] rounded-full bg-[radial-gradient(circle,#f5c46b,transparent_65%)] opacity-20 blur-2xl" />
        <span className="absolute inset-0 -z-10 bg-[radial-gradient(rgb(255_255_255/0.07)_1px,transparent_1px)] [mask-image:linear-gradient(to_bottom,black,transparent)] [background-size:22px_22px]" />
        <div className="flex items-center gap-3">
          <Image
            src="/logo-stivea-vet.png"
            alt=""
            width={40}
            height={38}
            className="rounded-[10px] ring-1 ring-white/20"
          />
          <span className="text-lg font-bold tracking-tight">
            stivea <span className="text-mint">vet</span>
          </span>
        </div>
        <div className="max-w-md">
          <div className="mb-8 flex items-center">
            {(["stive", "numa"] as const).map((assistant) => (
              <Image
                key={assistant}
                src={`/assistants/${assistant}.webp`}
                alt=""
                width={64}
                height={64}
                className="-ml-3 size-16 rounded-full object-cover ring-4 ring-[#08130f] first:ml-0"
              />
            ))}
            <span className="ml-3 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-mint ring-1 ring-white/15 backdrop-blur">
              {t.shell.nav.assistants}
            </span>
          </div>
          <p className="font-display text-[2.6rem] leading-[1.05] font-semibold tracking-[-0.02em] text-balance">
            {t.auth.brandTitle}
          </p>
          <p className="mt-5 text-base leading-relaxed text-white/70">
            {t.auth.brandBody}
          </p>
        </div>
        <p className="text-xs text-white/40">© Stivea Vet</p>
      </aside>
      <main className="relative flex min-h-screen flex-col items-center justify-center gap-6 bg-[radial-gradient(60rem_30rem_at_100%_0%,color-mix(in_oklab,#8ce8c3_25%,transparent),transparent_70%)] px-4 py-10">
        <div className="flex items-center gap-3 lg:hidden">
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
        <div className="w-full max-w-md rounded-[28px] border border-white/80 bg-surface/90 p-6 shadow-[0_1px_2px_rgb(11_18_32/0.04),0_30px_60px_-30px_rgb(8_60_40/0.35)] backdrop-blur-xl sm:p-9">
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
    </div>
  );
}
