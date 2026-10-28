"use client";

import { CircleAlert, MessageCircleCheck, Pill, Rocket } from "lucide-react";
import { useActionState, useRef } from "react";

import type { ReadyDraft } from "@/domains/suivis/lancement";
import { useAppText, useLocale } from "@/i18n/app/client";
import { AnimalAvatar } from "@/ui/animal-avatar";
import { Button, ButtonLink } from "@/ui/button";
import { SectionCard } from "@/ui/card";
import { ConfirmDialog } from "@/ui/dialog";
import { formatRelativeDayTime } from "@/ui/format";

import { ActionMessage } from "./action-message";
import { OptInQrCallout } from "./suivis/opt-in-qr-callout";
import { initialActionState } from "./action-state";
import { launchReadyAction, recordOptInAction } from "./suivis/launch-actions";

/** Ce que le serveur relit : chaque suivi avec les traitements affichés sur sa carte. */
function items(drafts: ReadyDraft[]) {
  return JSON.stringify(
    drafts.map((draft) => ({
      followupId: draft.id,
      treatmentIds: draft.treatments.map((treatment) => treatment.id),
    })),
  );
}

/** Lancement d'un seul suivi : un clic, les traitements affichés validés du même geste. */
function LaunchOne({ draft }: { draft: ReadyDraft }) {
  const [state, action, pending] = useActionState(
    launchReadyAction,
    initialActionState,
  );
  const text = useAppText().dashboard.ready;
  return (
    <form action={action} className="grid justify-items-start gap-2">
      <input type="hidden" name="items" value={items([draft])} />
      <Button
        type="submit"
        size="sm"
        disabled={pending}
        aria-busy={pending}
        icon={<Rocket aria-hidden="true" className="size-4" />}
      >
        {draft.treatments.length
          ? text.launchWithTreatments(draft.treatments.length)
          : text.launch}
        <span className="sr-only">{text.forAnimal(draft.animalName)}</span>
      </Button>
      <ActionMessage state={state} />
    </form>
  );
}

/** Accord WhatsApp recueilli à l'accueil (ADR 0047) : par qui prépare la fiche, en un clic. */
function RecordOptIn({ draft }: { draft: ReadyDraft }) {
  const [state, action, pending] = useActionState(
    recordOptInAction,
    initialActionState,
  );
  const text = useAppText().dashboard.ready;
  return (
    <form action={action} className="grid justify-items-start gap-2">
      <input type="hidden" name="followupId" value={draft.id} />
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        disabled={pending}
        aria-busy={pending}
        title={text.recordOptInHint}
        icon={<MessageCircleCheck aria-hidden="true" className="size-4" />}
      >
        {text.recordOptIn}
        <span className="sr-only">{text.forAnimal(draft.animalName)}</span>
      </Button>
      <ActionMessage state={state} />
    </form>
  );
}

/** « Tout lancer », confirmé dans une fenêtre : chaque suivi est relu par le serveur. */
function LaunchAll({ drafts }: { drafts: ReadyDraft[] }) {
  const [state, action] = useActionState(launchReadyAction, initialActionState);
  const form = useRef<HTMLFormElement>(null);
  const text = useAppText().dashboard.ready;
  return (
    <form ref={form} action={action} className="grid justify-items-end gap-2">
      <input type="hidden" name="items" value={items(drafts)} />
      <ConfirmDialog
        triggerLabel={text.launchAll(drafts.length)}
        triggerSize="sm"
        title={text.launchAllTitle(drafts.length)}
        description={text.launchAllDescription}
        confirmLabel={text.launchAllConfirm}
        onConfirm={() => form.current?.requestSubmit()}
      />
      <ActionMessage state={state} />
    </form>
  );
}

/**
 * File « Prêts à lancer » (ADR 0046), sur la vue d'ensemble : l'équipe prépare les fiches, le
 * vétérinaire responsable relit la carte et lance en un clic. Une fiche incomplète renvoie à la
 * fiche de lancement ; celle d'un confrère attend son responsable.
 */
export function ReadyQueue({
  drafts,
  now,
}: {
  drafts: ReadyDraft[];
  now: Date;
}) {
  const text = useAppText().dashboard.ready;
  const locale = useLocale();
  const launchable = drafts.filter(
    (draft) => draft.canLaunch && draft.blocker === null,
  );
  return (
    <SectionCard
      id="prets-a-lancer"
      title={text.title}
      description={text.description}
      action={launchable.length > 1 ? <LaunchAll drafts={launchable} /> : null}
    >
      <ul aria-label={text.title} className="grid divide-y divide-line">
        {drafts.map((draft) => {
          const sheet = `/app/suivis/${draft.id}/lancement`;
          const ready = draft.blocker === null;
          return (
            <li
              key={draft.id}
              className="grid gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"
            >
              <div className="flex min-w-0 gap-3">
                <AnimalAvatar name={draft.animalName} species={draft.species} />
                <div className="min-w-0">
                  <p className="font-semibold">
                    {draft.animalName}
                    <span className="font-normal text-ink-muted">
                      {" "}
                      · {draft.procedure}
                    </span>
                  </p>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-sm text-ink-muted">
                    <span>
                      {draft.protocolName
                        ? text.protocol(draft.protocolName)
                        : text.noProtocol}
                    </span>
                    {draft.firstContactAt ? (
                      <span>
                        {draft.firstContactAt.getTime() <= now.getTime()
                          ? text.firstMessageNow
                          : text.firstMessage(
                              formatRelativeDayTime(
                                draft.firstContactAt,
                                now,
                                locale,
                              ),
                            )}
                      </span>
                    ) : null}
                    {draft.controlAppointmentAt ? (
                      <span>
                        {text.control(
                          formatRelativeDayTime(
                            draft.controlAppointmentAt,
                            now,
                            locale,
                          ),
                        )}
                      </span>
                    ) : null}
                  </p>
                  {draft.treatments.length ? (
                    <div className="mt-2 rounded-[var(--radius-control)] bg-canvas-subtle px-3 py-2 text-sm">
                      <p className="flex items-center gap-1.5 font-medium">
                        <Pill
                          aria-hidden="true"
                          className="size-4 text-brand"
                        />
                        {text.treatments(draft.treatments.length)}
                      </p>
                      <ul className="mt-1 grid gap-0.5 text-ink-muted">
                        {draft.treatments.map((treatment) => (
                          <li key={treatment.id}>
                            <span className="font-medium text-ink">
                              {treatment.name}
                            </span>{" "}
                            · {treatment.instructions}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {!ready && draft.blocker ? (
                    <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-watch">
                      <CircleAlert aria-hidden="true" className="size-4" />
                      {text.blockers[draft.blocker]}
                    </p>
                  ) : null}
                  {ready && !draft.canLaunch ? (
                    <p className="mt-2 text-sm font-medium text-brand-ink">
                      {text.waiting(draft.responsibleName)}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap items-start gap-2 sm:justify-end">
                {ready && draft.canLaunch ? <LaunchOne draft={draft} /> : null}
                {draft.blocker === "optin_missing" ? (
                  <RecordOptIn draft={draft} />
                ) : null}
                <ButtonLink href={sheet} variant="secondary" size="sm">
                  {ready ? text.review : text.complete}
                  <span className="sr-only">
                    {text.forAnimal(draft.animalName)}
                  </span>
                </ButtonLink>
              </div>
              {draft.blocker === "optin_missing" ? (
                <OptInQrCallout
                  className="sm:col-span-2"
                  followupId={draft.id}
                  title={text.optInQrTitle}
                  body={text.showOptInQrHint}
                  action={text.showOptInQr}
                  actionSuffix={text.forAnimal(draft.animalName)}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}
