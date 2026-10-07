import { BellRing, ShieldCheck } from "lucide-react";
import Image from "next/image";

import type { SiteDictionary } from "@/i18n/site";
import { StatusBadge } from "@/ui/status-badge";
import { cn } from "@/ui/cn";

/**
 * Téléphone stylisé montrant une conversation WhatsApp fictive avec Numa (référence visuelle).
 * Ce n'est pas une capture d'un vrai service : la conversation est signalée comme fictive.
 */
export function PhoneDemo({ t }: { t: SiteDictionary }) {
  const phone = t.home.phone;
  return (
    <figure aria-label={phone.label} className="mx-auto w-full max-w-[19rem]">
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
      <figcaption className="mt-3 text-center text-xs text-white/70">
        {phone.simulated}
      </figcaption>
    </figure>
  );
}

/** Alerte flottante : l'intérêt clinique, avec libellé et icône (jamais la couleur seule). */
export function FloatingAlert({ t }: { t: SiteDictionary }) {
  const alert = t.home.alert;
  return (
    <div className="w-full max-w-[17rem] rounded-[var(--radius-card)] border border-line bg-surface p-4 text-ink shadow-[0_20px_50px_-15px_rgb(0_0_0/0.45)]">
      <div className="flex items-center justify-between gap-2">
        <StatusBadge status="watch" label={alert.level} />
        <BellRing aria-hidden="true" className="size-4 text-watch" />
      </div>
      <p className="mt-3 text-sm font-semibold">{alert.title}</p>
      <p className="mt-1 text-sm text-ink-muted">{alert.body}</p>
      <p className="mt-3 flex items-center gap-1.5 border-t border-line pt-3 text-xs text-ink-muted">
        <ShieldCheck aria-hidden="true" className="size-3.5 text-brand" />
        {alert.footer}
      </p>
    </div>
  );
}
