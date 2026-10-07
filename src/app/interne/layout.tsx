import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { serverEnv } from "@/server/env";

/** Pages internes de développement : jamais servies en production. */
export default function InterneLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  if (serverEnv().APP_ENV === "production") notFound();
  return children;
}
