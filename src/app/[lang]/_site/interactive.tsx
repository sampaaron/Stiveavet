"use client";

import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { cn } from "@/ui/cn";

/**
 * Film de présentation, placé sous le héros comme chez Limova (ADR 0043). Il démarre sans son
 * (exigence des navigateurs) sauf si la personne a demandé moins d'animations ; un bouton
 * active le son, un clic met en pause.
 */
export function FilmPlayer({
  src,
  poster,
  label,
  soundOn,
  soundOff,
  playLabel,
  pauseLabel,
}: {
  src: string;
  poster: string;
  label: string;
  soundOn: string;
  soundOff: string;
  playLabel: string;
  pauseLabel: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    element.play().catch(() => setPlaying(false));
  }, []);

  function toggle() {
    const element = video.current;
    if (!element) return;
    if (element.paused) void element.play();
    else element.pause();
  }

  return (
    <figure className="group relative overflow-hidden rounded-[28px] border border-white/10 bg-black shadow-[0_40px_120px_-40px_rgb(8_122_84/0.8),0_0_0_1px_rgb(140_232_195/0.08)]">
      <video
        ref={video}
        src={src}
        poster={poster}
        muted={muted}
        loop
        playsInline
        preload="metadata"
        aria-label={label}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onClick={toggle}
        className="block aspect-video w-full cursor-pointer object-cover"
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-gradient-to-t from-black/60 to-transparent p-4 sm:p-6">
        <button
          type="button"
          onClick={toggle}
          className="pointer-events-auto grid size-11 place-items-center rounded-full bg-white/12 text-white ring-1 ring-white/20 backdrop-blur-md transition-colors hover:bg-white/20"
        >
          {playing ? (
            <Pause aria-hidden="true" className="size-5" />
          ) : (
            <Play aria-hidden="true" className="size-5 translate-x-px" />
          )}
          <span className="sr-only">{playing ? pauseLabel : playLabel}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setMuted((value) => !value);
            if (video.current?.paused) void video.current.play();
          }}
          className="pointer-events-auto inline-flex min-h-11 items-center gap-2 rounded-full bg-white/12 px-4 text-sm font-semibold text-white ring-1 ring-white/20 backdrop-blur-md transition-colors hover:bg-white/20"
        >
          {muted ? (
            <VolumeX aria-hidden="true" className="size-4" />
          ) : (
            <Volume2 aria-hidden="true" className="size-4" />
          )}
          {muted ? soundOn : soundOff}
        </button>
      </div>
    </figure>
  );
}

export type AssistantTab = {
  key: "numa" | "stive";
  name: string;
  ai: string;
  role: string;
  points: readonly string[];
  link: ReactNode;
  /** Démonstration affichée à gauche du profil. */
  demo: ReactNode;
};

/** Onglets Numa / Stive, comme les onglets d'agents de Limova : démonstration et profil. */
export function AssistantTabs({
  label,
  tabs,
}: {
  label: string;
  tabs: readonly AssistantTab[];
}) {
  const [active, setActive] = useState(0);
  const tab = tabs[active] ?? tabs[0];
  if (!tab) return null;
  return (
    <div>
      <div
        role="tablist"
        aria-label={label}
        className="mx-auto flex w-fit flex-wrap justify-center gap-2 rounded-full border border-line/80 bg-surface/60 p-1.5 backdrop-blur"
      >
        {tabs.map((item, index) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            id={`onglet-${item.key}`}
            aria-selected={index === active}
            aria-controls={`panneau-${item.key}`}
            onClick={() => setActive(index)}
            className={cn(
              "inline-flex min-h-11 items-center gap-2.5 rounded-full py-1.5 pr-4 pl-1.5 text-sm font-semibold transition-all",
              index === active
                ? "bg-white text-[#0b1220] shadow-[0_8px_24px_-10px_rgb(140_232_195/0.8)]"
                : "text-ink-muted hover:bg-white/5 hover:text-ink",
            )}
          >
            {/* Portrait toujours visible avec sa mention IA (principe n° 3) ; texte visible
                doublé pour l'œil, l'image porte le nom accessible. */}
            <Image
              src={`/assistants/${item.key}.webp`}
              alt={`${item.name}, ${item.ai}`}
              width={32}
              height={32}
              className="size-8 rounded-full object-cover"
            />
            <span aria-hidden="true">{item.name}</span>
            <span
              aria-hidden="true"
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px]",
                index === active
                  ? "bg-[#5b4fe0]/10 text-[#5b4fe0]"
                  : "bg-white/8 text-ink-muted",
              )}
            >
              {item.ai}
            </span>
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`panneau-${tab.key}`}
        aria-labelledby={`onglet-${tab.key}`}
        className="mt-10 grid items-stretch gap-5 lg:grid-cols-[1.2fr_1fr]"
      >
        <div className="rounded-[28px] border border-line/80 bg-surface/60 p-5 backdrop-blur sm:p-8">
          {tab.demo}
        </div>
        <div className="flex flex-col rounded-[28px] border border-line/80 bg-surface/60 p-6 backdrop-blur sm:p-8">
          <div className="flex items-center gap-4">
            <Image
              src={`/assistants/${tab.key}.webp`}
              alt=""
              width={72}
              height={72}
              className="size-18 rounded-full object-cover ring-4 ring-white/10"
            />
            <div>
              <p className="text-2xl font-bold tracking-tight">{tab.name}</p>
              <p className="mt-1 w-fit rounded-full bg-mint/10 px-2.5 py-0.5 text-xs font-semibold text-mint">
                {tab.ai}
              </p>
            </div>
          </div>
          <p className="mt-5 font-semibold">{tab.role}</p>
          <ul className="mt-5 grid gap-3">
            {tab.points.map((point) => (
              <li
                key={point}
                className="flex items-start gap-3 rounded-2xl border border-line/70 bg-white/[0.03] px-4 py-3 text-sm"
              >
                <span
                  aria-hidden="true"
                  className="mt-1.5 size-2 shrink-0 rounded-full bg-mint shadow-[0_0_10px_#8ce8c3]"
                />
                {point}
              </li>
            ))}
          </ul>
          <div className="mt-auto pt-6">{tab.link}</div>
        </div>
      </div>
    </div>
  );
}

/** Étapes du démarrage, une ouverte à la fois, comme « Commencez en 3 étapes » chez Limova. */
export function StepsAccordion({
  steps,
}: {
  steps: readonly { title: string; body: string }[];
}) {
  const [open, setOpen] = useState(0);
  return (
    <ol className="grid gap-1">
      {steps.map((step, index) => {
        const isOpen = index === open;
        return (
          <li
            key={step.title}
            className="border-b border-line/70 last:border-0"
          >
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(index)}
              className="flex w-full items-center gap-4 py-4 text-left"
            >
              <span
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold transition-colors",
                  isOpen
                    ? "bg-mint text-night shadow-[0_0_20px_-4px_#8ce8c3]"
                    : "bg-white/6 text-ink-muted",
                )}
              >
                {index + 1}
              </span>
              <span
                className={cn(
                  "text-lg font-semibold tracking-tight",
                  isOpen ? "text-ink" : "text-ink-muted",
                )}
              >
                {step.title}
              </span>
            </button>
            <div
              className={cn(
                "grid transition-all duration-300",
                isOpen ? "grid-rows-[1fr] pb-5" : "grid-rows-[0fr]",
              )}
            >
              <p className="overflow-hidden pl-13 text-ink-muted">
                {step.body}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
