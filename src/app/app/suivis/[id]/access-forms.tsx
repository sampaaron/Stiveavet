"use client";

import { useActionState, useId } from "react";

import { useAppText } from "@/i18n/app/client";
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
  const text = useAppText().dossier.access;
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="followupId" value={followupId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-confrere`} className="text-sm font-semibold">
            {text.vet}
          </label>
          <select
            id={`${id}-confrere`}
            name="membershipId"
            className={selectClasses}
            defaultValue=""
          >
            <option value="" disabled>
              {text.choose}
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
            {text.duration}
          </label>
          <select
            id={`${id}-duree`}
            name="duration"
            className={selectClasses}
            defaultValue="illimite"
          >
            <option value="illimite">{text.untilRevoked}</option>
            <option value="7">{text.days(7)}</option>
            <option value="30">{text.days(30)}</option>
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
        {text.share}
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
  const t = useAppText();
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="followupId" value={followupId} />
      <input type="hidden" name="membershipId" value={membershipId} />
      <Button
        type="submit"
        variant="quiet"
        size="sm"
        disabled={pending}
        aria-label={t.dossier.access.revokeLabel(name)}
      >
        {t.common.remove}
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
  const text = useAppText().dossier.access;
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
        {isPrivate ? text.makePublic : text.makePrivate}
      </Button>
      <ActionMessage state={state} />
    </form>
  );
}
