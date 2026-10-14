import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { serverEnv } from "@/server/env";

/** Pages internes de développement : servies sur le poste local seulement. */
export default function InterneLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  if (serverEnv().APP_ENV !== "local") notFound();
  return children;
}
