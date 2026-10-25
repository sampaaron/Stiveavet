/** Navigateur et système lisibles à partir d'un User-Agent, sans détail technique. */
export function deviceLabel(userAgent: string | null): string | null {
  if (!userAgent) return null;
  const browser =
    [
      [/Edg\//, "Edge"],
      [/OPR\/|Opera/, "Opera"],
      [/Firefox\//, "Firefox"],
      [/Chrome\//, "Chrome"],
      [/Safari\//, "Safari"],
    ].find(([pattern]) => (pattern as RegExp).test(userAgent))?.[1] ?? null;
  const system =
    [
      [/Windows/, "Windows"],
      [/iPhone|iPad/, "iOS"],
      [/Android/, "Android"],
      [/Mac OS X|Macintosh/, "macOS"],
      [/Linux/, "Linux"],
    ].find(([pattern]) => (pattern as RegExp).test(userAgent))?.[1] ?? null;
  const parts = [browser, system].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}
