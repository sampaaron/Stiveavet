import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { UI_LOCALE_COOKIE } from "@/i18n/cookie";
import { requestLocale } from "@/i18n/routes";
import { buildContentSecurityPolicy, createNonce } from "@/server/security/csp";

export function proxy(request: NextRequest) {
  const nonce = createNonce();
  const csp = buildContentSecurityPolicy(
    nonce,
    process.env.NODE_ENV === "development",
  );

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  // Langue de la page ; toujours réécrite, limitée au français et à l'anglais (ADR 0022).
  const secure = request.nextUrl.protocol === "https:";
  requestHeaders.set(
    "x-stivea-locale",
    requestLocale(
      request.nextUrl.pathname,
      request.cookies.get(UI_LOCALE_COOKIE(secure))?.value,
      request.headers.get("accept-language"),
    ),
  );

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
