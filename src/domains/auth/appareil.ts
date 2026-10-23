/**
 * Libellé court d'un appareil (« Firefox · Windows »), tiré du navigateur annoncé : sans
 * version ni détail, seul ce libellé est gardé avec la session (ADR 0039). `null` si rien
 * n'est reconnu ; l'écran dit alors « appareil non identifié ».
 */
const BROWSERS: [RegExp, string][] = [
  [/\bEdg(?:e|A|iOS)?\//, "Edge"],
  [/\b(?:OPR|Opera)\//, "Opera"],
  [/\bSamsungBrowser\//, "Samsung Internet"],
  [/\b(?:Firefox|FxiOS)\//, "Firefox"],
  [/\b(?:Chrome|CriOS|Chromium)\//, "Chrome"],
  [/\bVersion\/[\d.]+.*\bSafari\//, "Safari"],
];

const SYSTEMS: [RegExp, string][] = [
  [/\b(?:iPhone|iPad|iPod)\b/, "iOS"],
  [/\bAndroid\b/, "Android"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\bWindows\b/, "Windows"],
  [/\bMac OS X\b|\bMacintosh\b/, "macOS"],
  [/\bLinux\b/, "Linux"],
];

const first = (list: [RegExp, string][], userAgent: string) =>
  list.find(([pattern]) => pattern.test(userAgent))?.[1];

export function deviceLabel(userAgent: string | null): string | null {
  if (!userAgent) return null;
  const parts = [first(BROWSERS, userAgent), first(SYSTEMS, userAgent)].filter(
    (part): part is string => !!part,
  );
  return parts.length ? parts.join(" · ") : null;
}
