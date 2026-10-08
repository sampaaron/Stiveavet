"use client";

import { FastForward, ImagePlus, Mic, Send } from "lucide-react";
import { useActionState, useId } from "react";

import { Button } from "@/ui/button";

import { ActionMessage } from "../../../action-message";
import { initialActionState } from "../../../action-state";
import {
  runDueNowAction,
  simulateOwnerAction,
  simulateOwnerPhotoAction,
  simulateOwnerVoiceAction,
} from "../../conversation-actions";

const QUICK_REPLIES = ["OUI", "STOP", "REPRENDRE"] as const;
/** Réponses à la question de Numa après un STOP écrit dans le groupe (lot 18). */
const GROUP_REPLIES = ["GROUPE", "TOUT"] as const;

type Role = "primary" | "secondary";

/** Ce que le propriétaire écrit depuis « son » WhatsApp (simulé). */
export function OwnerSimulatorForm({
  followupId,
  ownerFirstName,
  from,
}: {
  followupId: string;
  ownerFirstName: string;
  from: Role;
}) {
  const [state, action, pending] = useActionState(
    simulateOwnerAction,
    initialActionState,
  );
  const id = useId();

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2" aria-label="Réponses rapides">
        {[...QUICK_REPLIES, ...GROUP_REPLIES].map((reply) => (
          <form key={reply} action={action}>
            <input type="hidden" name="followupId" value={followupId} />
            <input type="hidden" name="from" value={from} />
            <input type="hidden" name="body" value={reply} />
            <Button
              type="submit"
              size="sm"
              variant="secondary"
              disabled={pending}
            >
              {reply}
            </Button>
          </form>
        ))}
      </div>
      <form action={action} className="grid gap-2">
        <input type="hidden" name="followupId" value={followupId} />
        <input type="hidden" name="from" value={from} />
        <label htmlFor={id} className="text-sm font-semibold">
          Message de {ownerFirstName}
        </label>
        <div className="flex items-end gap-2">
          <textarea
            id={id}
            name="body"
            rows={2}
            maxLength={4096}
            className="min-h-11 min-w-0 flex-1 resize-y rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2 text-[15px] placeholder:text-ink-muted"
            placeholder="Écrire comme le propriétaire"
          />
          <Button
            type="submit"
            disabled={pending}
            aria-busy={pending}
            aria-label="Envoyer en tant que propriétaire"
            icon={<Send aria-hidden="true" className="size-4" />}
          />
        </div>
      </form>
      <ActionMessage state={state} />
    </div>
  );
}

/** Faire passer le temps : les envois prévus de ce suivi partent tout de suite. */
export function RunDueNowForm({ followupId }: { followupId: string }) {
  const [state, action, pending] = useActionState(
    runDueNowAction,
    initialActionState,
  );
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="followupId" value={followupId} />
      <Button
        type="submit"
        size="sm"
        variant="secondary"
        disabled={pending}
        aria-busy={pending}
        icon={<FastForward aria-hidden="true" className="size-4" />}
      >
        Avancer jusqu&apos;au prochain envoi prévu
      </Button>
      <ActionMessage state={state} />
    </form>
  );
}

const FIELD =
  "min-h-11 min-w-0 rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2 text-[15px] placeholder:text-ink-muted";

/** Photo envoyée par le propriétaire (fichier de votre appareil, jamais une vraie photo de patient). */
export function OwnerPhotoForm({
  followupId,
  ownerFirstName,
  from,
}: {
  followupId: string;
  ownerFirstName: string;
  from: Role;
}) {
  const [state, action, pending] = useActionState(
    simulateOwnerPhotoAction,
    initialActionState,
  );
  const id = useId();
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="followupId" value={followupId} />
      <input type="hidden" name="from" value={from} />
      <label htmlFor={`${id}-file`} className="text-sm font-semibold">
        Photo envoyée par {ownerFirstName}
      </label>
      <input
        id={`${id}-file`}
        name="photo"
        type="file"
        required
        accept="image/jpeg,image/png,image/webp"
        className={`${FIELD} w-full file:mr-3 file:rounded-full file:border-0 file:bg-brand-soft file:px-3 file:py-1 file:text-sm file:font-semibold file:text-brand-ink`}
      />
      <label htmlFor={`${id}-caption`} className="text-sm font-semibold">
        Légende (facultative)
      </label>
      <input
        id={`${id}-caption`}
        name="caption"
        type="text"
        maxLength={1024}
        className={FIELD}
      />
      <p className="text-xs text-ink-muted">
        JPEG, PNG ou WebP, 5 Mo au plus. Utilisez une image sans donnée réelle.
      </p>
      <Button
        type="submit"
        size="sm"
        variant="secondary"
        disabled={pending}
        aria-busy={pending}
        icon={<ImagePlus aria-hidden="true" className="size-4" />}
      >
        Envoyer la photo
      </Button>
      <ActionMessage state={state} />
    </form>
  );
}

/** Message vocal simulé : le texte « prononcé » devient un fichier son. */
export function OwnerVoiceForm({
  followupId,
  ownerFirstName,
  from,
}: {
  followupId: string;
  ownerFirstName: string;
  from: Role;
}) {
  const [state, action, pending] = useActionState(
    simulateOwnerVoiceAction,
    initialActionState,
  );
  const id = useId();
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="followupId" value={followupId} />
      <input type="hidden" name="from" value={from} />
      <label htmlFor={id} className="text-sm font-semibold">
        Ce que dit le message vocal de {ownerFirstName}
      </label>
      <textarea
        id={id}
        name="spoken"
        rows={2}
        required
        maxLength={1000}
        className={`${FIELD} resize-y`}
        placeholder="Par exemple : elle mange bien depuis ce matin"
      />
      <p className="text-xs text-ink-muted">
        Un vrai fichier son est créé ; la transcription simulée relit ce texte.
      </p>
      <Button
        type="submit"
        size="sm"
        variant="secondary"
        disabled={pending}
        aria-busy={pending}
        icon={<Mic aria-hidden="true" className="size-4" />}
      >
        Envoyer le vocal
      </Button>
      <ActionMessage state={state} />
    </form>
  );
}
