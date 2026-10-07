import Image from "next/image";

/** Page temporaire du socle technique ; remplacée par le site public au lot 9. */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-4 py-16">
      <Image
        src="/logo-stivea-vet.png"
        alt="Stivea Vet"
        width={96}
        height={91}
        className="rounded-[var(--radius-card)]"
        priority
      />
      <div className="rounded-[var(--radius-card)] border border-line bg-surface p-8 shadow-[var(--shadow-card)]">
        <h1 className="text-2xl font-bold tracking-tight">Stivea Vet</h1>
        <p className="mt-2 text-ink-muted">
          Le socle technique est en place. Les premiers écrans arrivent avec le
          lot 2.
        </p>
        <p className="mt-6 inline-flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1 text-sm font-semibold text-brand-ink">
          <span aria-hidden="true">●</span>
          Environnement local, données fictives uniquement
        </p>
      </div>
    </main>
  );
}
