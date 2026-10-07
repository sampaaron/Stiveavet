import type { ReactNode } from "react";

export function AuthHeading({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-6">
      <h1 className="text-xl font-bold tracking-tight">{title}</h1>
      {children ? (
        <p className="mt-1.5 text-sm text-ink-muted">{children}</p>
      ) : null}
    </div>
  );
}
