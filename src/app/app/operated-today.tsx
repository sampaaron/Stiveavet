"use client";

import { ClipboardPen, ShieldCheck } from "lucide-react";
import { useActionState } from "react";

import type { OperatedAnimal } from "@/domains/suivis/lancement";
import { useAppText, useLocale } from "@/i18n/app/client";
import { AnimalAvatar } from "@/ui/animal-avatar";
import { Button, ButtonLink } from "@/ui/button";
import { SectionCard } from "@/ui/card";
import { formatTime } from "@/ui/format";

import { ActionMessage } from "./action-message";
import { initialActionState } from "./action-state";
import { prepareOperatedAction } from "./suivis/launch-actions";

/** Un bouton qui prépare une ou plusieurs fiches ; le serveur relit tout dans dr.veto. */
function PrepareButton({
  refs,
  label,
  animal,
  variant,
}: {
  refs: string[];
  label: string;
  animal?: string;
  variant: "primary" | "secondary";
}) {
  const [state, action, pending] = useActionState(
    prepareOperatedAction,
    initialActionState,
  );
  const text = useAppText().dashboard.ready;
  return (
    <form action={action} className="grid justify-items-start gap-2">
      {refs.map((ref) => (
        <input key={ref} type="hidden" name="ref" value={ref} />
      ))}
      <Button
        type="submit"
        size="sm"
        variant={variant}
        disabled={pending}
        aria-busy={pending}
        icon={<ClipboardPen aria-hidden="true" className="size-4" />}
      >
        {label}
        {animal ? (
          <span className="sr-only">{text.forAnimal(animal)}</span>
        ) : null}
      </Button>
      <ActionMessage state={state} />
    </form>
  );
}

/**
 * « Opérés du jour » (ADR 0047), sur la vue d'ensemble : les animaux opérés aujourd'hui selon
 * dr.veto. Un clic prépare la fiche (protocole proposé, premier message et contrôle
 * préremplis, responsable d'office le vétérinaire qui a opéré) ; elle rejoint « Prêts à
 * lancer », où seul le vétérinaire responsable lance.
 */
export function OperatedToday({ animals }: { animals: OperatedAnimal[] }) {
  const t = useAppText();
  const text = t.dashboard.operated;
  const locale = useLocale();
  const pending = animals.filter((animal) => animal.followup === null);
  return (
    <SectionCard
      title={text.title}
      description={text.description}
      action={
        pending.length > 1 ? (
          <PrepareButton
            refs={pending.map((animal) => animal.ref)}
            label={text.prepareAll(pending.length)}
            variant="secondary"
          />
        ) : null
      }
    >
      <ul aria-label={text.title} className="grid divide-y divide-line">
        {animals.map((animal) => (
          <li
            key={animal.ref}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0"
          >
            <AnimalAvatar name={animal.name} species={animal.species} />
            <div className="min-w-0 flex-1 basis-48">
              <p className="font-semibold">
                {animal.name}
                <span className="font-normal text-ink-muted">
                  {" "}
                  · {animal.procedure}
                </span>
              </p>
              <p className="text-sm text-ink-muted">
                {text.at(formatTime(animal.at, locale))}
                {animal.practitionerName
                  ? ` ${text.by(animal.practitionerName)}`
                  : null}
              </p>
            </div>
            {animal.followup === null ? (
              <PrepareButton
                refs={[animal.ref]}
                label={text.prepare}
                animal={animal.name}
                variant="primary"
              />
            ) : animal.followup.status === "draft" ? (
              <a
                href="#prets-a-lancer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-ink hover:underline"
              >
                <ShieldCheck aria-hidden="true" className="size-4" />
                {text.draft}
                <span className="sr-only">
                  {t.dashboard.ready.forAnimal(animal.name)}
                </span>
              </a>
            ) : (
              <ButtonLink
                href={`/app/suivis/${animal.followup.id}`}
                variant="quiet"
                size="sm"
              >
                {text.open}
                <span className="sr-only">
                  {t.dashboard.ready.forAnimal(animal.name)}
                </span>
              </ButtonLink>
            )}
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
