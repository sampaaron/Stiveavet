import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { appText } from "@/i18n/app/server";
import { pathFor } from "@/i18n/routes";
import { serverEnv } from "@/server/env";
import { cn } from "@/ui/cn";
import { LogoMark } from "@/ui/logo";

import { LanguageSwitch } from "../language-switch";

/**
 * Écrans d'accès : panneau de marque à gauche sur grand écran (ADR 0033), carte du
 * formulaire à droite, utilisable dès 320 px.
 */
export default async function AuthLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const { t, locale } = await appText();
  // Le logo ramène au site public, dans la langue de l'interface.
  const brand = (onDark: boolean) => (
    <Link
      href={pathFor("home", locale)}
      title={t.shell.backToSite}
      className="flex items-center gap-3 rounded-[12px]"
    >
      <LogoMark className={cn("h-10 w-auto", !onDark && "text-night")} />
      <span className="text-lg font-bold tracking-tight">
        <span className="sr-only">{t.shell.backToSite} : </span>
        stivea <span className={onDark ? "text-mint" : "text-brand"}>vet</span>
      </span>
    </Link>
  );
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="relative isolate hidden overflow-hidden bg-[#08130f] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <span
          aria-hidden="true"
          className="absolute -top-32 -left-24 -z-10 size-[30rem] rounded-full bg-[conic-gradient(from_180deg,#8ce8c3,#087a54,#5b4fe0,#8ce8c3)] opacity-35 blur-3xl"
        />
        <span
          aria-hidden="true"
          className="absolute -right-24 -bottom-40 -z-10 size-[26rem] rounded-full bg-[radial-gradient(circle,#f5c46b,transparent_65%)] opacity-20 blur-2xl"
        />
        <span
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[radial-gradient(rgb(255_255_255/0.07)_1px,transparent_1px)] [mask-image:linear-gradient(to_bottom,black,transparent)] [background-size:22px_22px]"
        />
        <div className="flex">{brand(true)}</div>
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
        <div className="lg:hidden">{brand(false)}</div>
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
