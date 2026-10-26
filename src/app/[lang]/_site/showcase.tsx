import Image from "next/image";

import type { SiteDictionary } from "@/i18n/site";
import { LogoMark } from "@/ui/logo";
import { StatusBadge } from "@/ui/status-badge";
import { cn } from "@/ui/cn";

/**
 * Téléphone stylisé montrant une conversation WhatsApp fictive avec Numa (référence visuelle).
 * Ce n'est pas une capture d'un vrai service : la conversation est signalée comme fictive.
 */
export function PhoneDemo({ t }: { t: SiteDictionary }) {
  const phone = t.home.phone;
  return (
    <figure
      aria-label={phone.label}
      className="theme-light mx-auto w-full max-w-[19rem]"
    >
      <div className="rounded-[2.6rem] bg-night-soft p-2.5 shadow-[0_30px_80px_-20px_rgb(0_0_0/0.6)] ring-1 ring-white/10">
        <div className="overflow-hidden rounded-[2.1rem] bg-[#efeae2]">
          <div className="flex items-center gap-2.5 bg-brand-strong px-4 pt-5 pb-3 text-white">
            <Image
              src="/assistants/numa.webp"
              alt=""
              width={34}
              height={34}
              className="rounded-full object-cover"
            />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-semibold">{phone.cabinet}</p>
              <p className="text-[11px] text-white/85">{phone.channel}</p>
            </div>
          </div>
          <ol className="flex flex-col gap-2 px-3 py-4 text-[13px] leading-snug text-ink">
            {phone.messages.map((message, index) => (
              <li
                key={index}
                className={cn(
                  "max-w-[85%] rounded-xl px-3 py-2 shadow-sm",
                  message.from === "numa"
                    ? "self-start rounded-tl-sm bg-white"
                    : "self-end rounded-tr-sm bg-[#d9fdd3]",
                )}
              >
                {message.from === "numa" && index === 0 ? (
                  <span className="mb-0.5 block text-[11px] font-semibold text-accent">
                    Numa · {t.common.numaAi}
                  </span>
                ) : null}
                {message.text}
                <span className="mt-0.5 block text-right text-[10px] text-ink-muted">
                  {message.time}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-xs text-[#a7bcb2]">
        {phone.simulated}
      </figcaption>
    </figure>
  );
}

/**
 * Aperçu fictif de l'espace cabinet (ADR 0043) : la même barre latérale, le même « point de
 * Numa » et les mêmes cartes de suivi que le logiciel, en miniature. Décor illustratif : les
 * données sont fictives et l'aperçu n'est pas interactif.
 */
export function AppPreview({ t }: { t: SiteDictionary }) {
  const preview = t.home.preview;
  return (
    <figure
      aria-label={preview.label}
      className="theme-light overflow-hidden rounded-[22px] bg-[#0b1512] shadow-[0_40px_100px_-30px_rgb(0_0_0/0.75)] ring-1 ring-white/10"
    >
      <div
        aria-hidden="true"
        className="flex items-center gap-1.5 border-b border-white/10 px-4 py-2.5"
      >
        {["#ff6b5b", "#f5c46b", "#8ce8c3"].map((color) => (
          <span
            key={color}
            className="size-2.5 rounded-full opacity-80"
            style={{ background: color }}
          />
        ))}
      </div>
      <div className="grid grid-cols-[3.25rem_minmax(0,1fr)]">
        <div
          aria-hidden="true"
          className="flex flex-col items-center gap-3 py-4 sidebar-glow"
        >
          <LogoMark className="h-6 w-auto text-white" />
          {["#f5c46b", "#7fe3d6", "#c9b8ff", "#ffb39e", "#a9c1ff"].map(
            (glow, index) => (
              <span
                key={glow}
                className={cn(
                  "size-7 rounded-full",
                  index === 0 ? "bg-white/12 ring-1 ring-white/15" : "",
                )}
              >
                <span
                  className="m-auto mt-[11px] block size-1.5 rounded-full"
                  style={{ background: glow, boxShadow: `0 0 8px ${glow}` }}
                />
              </span>
            ),
          )}
        </div>
        <div className="relative isolate overflow-hidden bg-canvas p-4 text-ink sm:p-5">
          <div
            aria-hidden="true"
            className="absolute -top-16 -right-10 -z-10 size-48 rounded-full bg-[radial-gradient(circle,#f5c46b,transparent_70%)] opacity-40 blur-2xl"
          />
          <p className="flex items-center gap-2 text-[11px] font-semibold text-brand-ink">
            <span
              aria-hidden="true"
              className="h-[3px] w-5 rounded-full bg-brand"
            />
            {preview.today}
          </p>
          <p className="mt-1.5 font-display text-xl font-semibold tracking-tight">
            {preview.greeting}
          </p>
          <div className="mt-3 rounded-[16px] border border-white/70 p-3 shadow-[0_12px_30px_-18px_rgb(8_122_84/0.5)] assistant-glow">
            <p className="flex items-center gap-2 text-[12px] font-bold">
              <Image
                src="/assistants/stive.webp"
                alt=""
                width={22}
                height={22}
                className="size-[22px] rounded-full object-cover"
              />
              {preview.briefingTitle}
              <span className="rounded-full bg-accent/10 px-1.5 py-px text-[10px] font-semibold text-accent">
                {t.common.stiveAi}
              </span>
            </p>
            <p className="mt-1.5 font-display text-[13px] leading-snug">
              {preview.briefing}
            </p>
          </div>
          <ul className="mt-3 grid gap-1.5">
            {preview.rows.map((row) => (
              <li
                key={row.name}
                className="relative flex items-center gap-2.5 overflow-hidden rounded-[12px] border border-line/80 bg-surface/90 py-2 pr-2 pl-3.5"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute inset-y-2 left-0 w-[3px] rounded-r-full",
                    row.status === "watch" ? "bg-watch" : "bg-brand/30",
                  )}
                />
                <span
                  aria-hidden="true"
                  className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-soft font-display text-[13px] font-semibold text-brand-ink"
                >
                  {row.name.charAt(0)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-semibold">
                    {row.name}
                  </span>
                  <span className="block truncate text-[11px] text-ink-muted">
                    {row.line}
                  </span>
                </span>
                {row.status === "watch" ? (
                  <StatusBadge status="watch" label={t.home.alert.level} />
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </figure>
  );
}
