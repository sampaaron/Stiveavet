"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { Locale } from "@/i18n/locales";
import type { SiteDictionary } from "@/i18n/site";

const SOURCE = "/videos/stivea-vet-presentation";

/**
 * Vidéo de présentation, placée comme celle de limova.ai : lancée en sourdine et en boucle,
 * avec « Activer le son ». Si l'animation est réduite, elle attend un clic sur Lecture.
 * Les sous-titres reprennent les textes affichés à l'écran, dans la langue de la page.
 */
export function PresentationVideo({
  locale,
  copy,
}: {
  locale: Locale;
  copy: SiteDictionary["home"]["video"];
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Un navigateur peut refuser la lecture automatique : la vidéo attend alors un clic.
    element.play().catch(() => undefined);
  }, []);

  function toggleSound() {
    const element = video.current;
    if (!element) return;
    element.muted = !element.muted;
    setMuted(element.muted);
    if (!element.muted && element.paused) element.play().catch(() => undefined);
  }

  return (
    <figure className="relative overflow-hidden rounded-[28px] bg-night-soft shadow-[0_40px_120px_-40px_rgb(140_232_195/0.35)] ring-1 ring-white/10">
      <video
        ref={video}
        className="aspect-video w-full"
        aria-label={copy.label}
        poster={`${SOURCE}.webp`}
        muted
        loop
        playsInline
        controls
        preload="metadata"
        onVolumeChange={(event) => setMuted(event.currentTarget.muted)}
      >
        <source src={`${SOURCE}.mp4`} type="video/mp4" />
        <track
          kind="captions"
          src={`${SOURCE}.${locale}.vtt`}
          srcLang={locale}
          label={copy.captions}
          default
        />
        <a href={`${SOURCE}.mp4`}>{copy.fallback}</a>
      </video>
      <button
        type="button"
        onClick={toggleSound}
        className="absolute top-3 right-3 inline-flex min-h-10 items-center gap-2 rounded-full bg-night/80 px-3.5 text-xs font-semibold text-white ring-1 ring-white/20 backdrop-blur transition-colors hover:bg-night sm:top-4 sm:right-4 sm:min-h-11 sm:px-4 sm:text-sm"
      >
        {muted ? (
          <VolumeX aria-hidden="true" className="size-4" />
        ) : (
          <Volume2 aria-hidden="true" className="size-4 text-mint" />
        )}
        {muted ? copy.soundOn : copy.soundOff}
      </button>
    </figure>
  );
}
