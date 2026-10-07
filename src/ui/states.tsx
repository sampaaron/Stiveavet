import { CircleAlert, Inbox, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";

type StateProps = { title: string; description?: string; action?: ReactNode };

function StateLayout({
  icon,
  title,
  description,
  action,
}: StateProps & { icon: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <span
        aria-hidden="true"
        className="mb-1 rounded-full bg-canvas-subtle p-3 text-ink-muted"
      >
        {icon}
      </span>
      <p className="font-semibold">{title}</p>
      {description ? (
        <p className="max-w-sm text-sm text-ink-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function EmptyState(props: StateProps) {
  return <StateLayout icon={<Inbox className="size-5" />} {...props} />;
}

export function LoadingState({ title = "Chargement…" }: { title?: string }) {
  return (
    <div role="status" aria-live="polite">
      <StateLayout
        icon={<LoaderCircle className="size-5 motion-safe:animate-spin" />}
        title={title}
      />
    </div>
  );
}

export function ErrorState(props: StateProps) {
  return (
    <div role="alert">
      <StateLayout
        icon={<CircleAlert className="size-5 text-urgent" />}
        {...props}
      />
    </div>
  );
}
