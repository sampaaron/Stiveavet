import { Sparkles } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { appText } from "@/i18n/app/server";
import type { AppDictionary } from "@/i18n/app/types";
import { memberContext } from "@/server/authz";
import { ButtonLink } from "@/ui/button";
import { Card, SectionCard } from "@/ui/card";
import { PageHeader } from "@/ui/page-header";

import { ShortcutForm } from "./shortcut-form";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await appText();
  return { title: t.hub.shortcuts.title };
}

type ShortcutKey = keyof AppDictionary["hub"]["shortcuts"]["items"];

/** Raccourcis rangés par usage ; chacun est une demande que Stive sait traiter. */
const GROUPS: readonly {
  key: keyof AppDictionary["hub"]["shortcuts"]["groups"];
  items: readonly ShortcutKey[];
}[] = [
  { key: "day", items: ["briefing", "appointments"] },
  { key: "agenda", items: ["slots", "teamSlots"] },
  { key: "files", items: ["summary", "news", "photo", "call"] },
];

/**
 * Raccourcis (ADR 0044) : des demandes toutes prêtes pour Stive. Chaque bouton envoie la
 * demande comme si la personne l'avait écrite : mêmes droits, même décompte, et rien ne part
 * vers un propriétaire sans son clic. Sans Stive, l'administrateur voit où le découvrir.
 */
export default async function ShortcutsPage() {
  const context = await memberContext();
  const { t } = await appText();
  const text = t.hub.shortcuts;
  const header = (
    <PageHeader title={text.title} description={text.description} />
  );

  if (!context.permissions.has("stive.use")) {
    if (!context.permissions.has("billing.manage")) notFound();
    return (
      <>
        {header}
        <Card className="flex flex-col items-start gap-4 p-6">
          <p>{text.notIncluded}</p>
          <ButtonLink
            href="/app/stive"
            icon={<Sparkles aria-hidden="true" className="size-4" />}
          >
            {t.hub.assistants.stive.seeOffer}
          </ButtonLink>
        </Card>
      </>
    );
  }

  return (
    <>
      {header}
      <div className="grid gap-6">
        {GROUPS.map((group) => (
          <SectionCard key={group.key} title={text.groups[group.key]}>
            <ul className="grid gap-3 sm:grid-cols-2">
              {group.items.map((key) => {
                const item = text.items[key];
                return (
                  <li
                    key={key}
                    className="flex flex-col gap-3 rounded-[var(--radius-control)] border border-line bg-canvas/60 p-4"
                  >
                    <div>
                      <h3 className="font-semibold">{item.title}</h3>
                      <p className="mt-1 text-sm text-ink-muted">{item.text}</p>
                    </div>
                    <ShortcutForm
                      question={item.question}
                      submit={text.run}
                      label={text.runLabel(item.title)}
                    />
                  </li>
                );
              })}
            </ul>
          </SectionCard>
        ))}
      </div>
    </>
  );
}
