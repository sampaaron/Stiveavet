"use client";

import { useActionState, useId } from "react";

import { Button } from "@/ui/button";

import { ActionMessage, selectClasses } from "../../action-message";
import { initialActionState } from "../../action-state";

import {
  revokeShareAction,
  setPrivateAction,
  shareFollowupAction,
} from "./actions";

export function ShareForm({
  followupId,
  candidates,
}: {
  followupId: string;
  candidates: { membershipId: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(
    shareFollowupAction,
    initialActionState,
  );
  const id = useId();
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="followupId" value={followupId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-confrere`} className="text-sm font-semibold">
            Vétérinaire
          </label>
          <select
            id={`${id}-confrere`}
            name="membershipId"
            className={selectClasses}
            defaultValue=""
          >
            <option value="" disabled>
              Choisir…
            </option>
            {candidates.map((candidate) => (
              <option
                key={candidate.membershipId}
                value={candidate.membershipId}
              >
                {candidate.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-duree`} className="text-sm font-semibold">
            Durée
          </label>
          <select
            id={`${id}-duree`}
            name="duration"
            className={selectClasses}
            defaultValue="illimite"
          >
            <option value="illimite">Jusqu&apos;à retrait</option>
            <option value="7">7 jours</option>
            <option value="30">30 jours</option>
          </select>
        </div>
      </div>
      <ActionMessage state={state} />
      <Button
        type="submit"
        variant="secondary"
        disabled={pending}
        aria-busy={pending}
      >
        Partager le dossier
      </Button>
    </form>
  );
}

export function RevokeShareForm({
  followupId,
  membershipId,
  name,
}: {
  followupId: string;
  membershipId: string;
  name: string;
}) {
  const [state, action, pending] = useActionState(
    revokeShareAction,
    initialActionState,
  );
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="followupId" value={followupId} />
      <input type="hidden" name="membershipId" value={membershipId} />
      <Button
        type="submit"
        variant="quiet"
        size="sm"
        disabled={pending}
        aria-label={`Retirer le partage avec ${name}`}
      >
        Retirer
      </Button>
      <ActionMessage state={state} />
    </form>
  );
}

export function PrivacyForm({
  followupId,
  isPrivate,
}: {
  followupId: string;
  isPrivate: boolean;
}) {
  const [state, action, pending] = useActionState(
    setPrivateAction,
    initialActionState,
  );
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="followupId" value={followupId} />
      <input type="hidden" name="isPrivate" value={String(!isPrivate)} />
      <Button
        type="submit"
        variant="secondary"
        disabled={pending}
        aria-busy={pending}
      >
        {isPrivate ? "Rendre visible au cabinet" : "Rendre le dossier privé"}
      </Button>
      <ActionMessage state={state} />
    </form>
  );
}
