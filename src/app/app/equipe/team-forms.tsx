"use client";

import { useActionState, useId } from "react";

import { Button } from "@/ui/button";
import { TextField } from "@/ui/text-field";

import { ActionMessage, selectClasses } from "../action-message";
import { initialActionState } from "../action-state";

import {
  changeRoleAction,
  deactivateAction,
  inviteAction,
  reactivateAction,
  revokeInvitationAction,
  setPermissionsAction,
} from "./actions";

type Option = { value: string; label: string };

export function InviteForm({ roles }: { roles: Option[] }) {
  const [state, action, pending] = useActionState(
    inviteAction,
    initialActionState,
  );
  const id = useId();
  return (
    <form action={action} className="grid gap-4" noValidate>
      <div className="grid gap-4 md:grid-cols-3">
        <TextField
          label="Nom"
          name="displayName"
          autoComplete="off"
          required
          maxLength={120}
        />
        <TextField
          label="Adresse e-mail"
          name="email"
          type="email"
          autoComplete="off"
          required
          maxLength={254}
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-role`} className="text-sm font-semibold">
            Rôle
          </label>
          <select
            id={`${id}-role`}
            name="role"
            className={selectClasses}
            defaultValue="vet"
          >
            {roles.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <ActionMessage state={state} />
      <div>
        <Button type="submit" disabled={pending} aria-busy={pending}>
          Envoyer l&apos;invitation
        </Button>
      </div>
    </form>
  );
}

export function RevokeInvitationForm({
  id,
  email,
}: {
  id: string;
  email: string;
}) {
  const [state, action, pending] = useActionState(
    revokeInvitationAction,
    initialActionState,
  );
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="id" value={id} />
      <Button
        type="submit"
        variant="quiet"
        size="sm"
        disabled={pending}
        aria-label={`Annuler l'invitation de ${email}`}
      >
        Annuler
      </Button>
      <ActionMessage state={state} />
    </form>
  );
}

export function PermissionsForm({
  membershipId,
  memberName,
  options,
  granted,
}: {
  membershipId: string;
  memberName: string;
  /** Permissions possibles pour le rôle ; `fixed` : donnée par défaut au rôle. */
  options: (Option & { fixed: boolean })[];
  granted: string[];
}) {
  const [state, action, pending] = useActionState(
    setPermissionsAction,
    initialActionState,
  );
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="membershipId" value={membershipId} />
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-semibold">
          Droits de {memberName}
        </legend>
        {options.map((option) => (
          <label
            key={option.value}
            className="flex items-start gap-2.5 text-sm"
          >
            <input
              type="checkbox"
              name="permissions"
              value={option.value}
              defaultChecked={granted.includes(option.value)}
              className="mt-0.5 size-4 accent-[var(--color-brand)]"
            />
            <span>
              {option.label}
              {option.fixed ? null : (
                <span className="text-ink-muted"> · sur décision</span>
              )}
            </span>
          </label>
        ))}
      </fieldset>
      <ActionMessage state={state} />
      <div>
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          disabled={pending}
          aria-busy={pending}
        >
          Enregistrer les droits
        </Button>
      </div>
    </form>
  );
}

export function RoleForm({
  membershipId,
  memberName,
  role,
  roles,
}: {
  membershipId: string;
  memberName: string;
  role: string;
  roles: Option[];
}) {
  const [state, action, pending] = useActionState(
    changeRoleAction,
    initialActionState,
  );
  const id = useId();
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="membershipId" value={membershipId} />
      <label htmlFor={`${id}-role`} className="text-sm font-semibold">
        Rôle de {memberName}
      </label>
      <div className="flex flex-wrap gap-2">
        <select
          id={`${id}-role`}
          name="role"
          className={selectClasses}
          defaultValue={role}
        >
          {roles.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <Button
          type="submit"
          variant="secondary"
          disabled={pending}
          aria-busy={pending}
        >
          Changer le rôle
        </Button>
      </div>
      <ActionMessage state={state} />
    </form>
  );
}

export function DeactivateForm({
  membershipId,
  memberName,
  activeFollowups,
  targets,
}: {
  membershipId: string;
  memberName: string;
  activeFollowups: number;
  targets: Option[];
}) {
  const [state, action, pending] = useActionState(
    deactivateAction,
    initialActionState,
  );
  const id = useId();
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="membershipId" value={membershipId} />
      {activeFollowups > 0 ? (
        <>
          <label htmlFor={`${id}-reprise`} className="text-sm font-semibold">
            {activeFollowups > 1
              ? `Ses ${activeFollowups} suivis en cours passent à`
              : "Son suivi en cours passe à"}
          </label>
          <select
            id={`${id}-reprise`}
            name="reassignTo"
            className={selectClasses}
            defaultValue=""
          >
            <option value="" disabled>
              Choisir un vétérinaire…
            </option>
            {targets.map((target) => (
              <option key={target.value} value={target.value}>
                {target.label}
              </option>
            ))}
          </select>
        </>
      ) : (
        <input type="hidden" name="reassignTo" value="" />
      )}
      <ActionMessage state={state} />
      <div>
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          disabled={pending}
          aria-busy={pending}
          aria-label={`Retirer l'accès de ${memberName}`}
        >
          Retirer l&apos;accès
        </Button>
      </div>
    </form>
  );
}

export function ReactivateForm({
  membershipId,
  memberName,
}: {
  membershipId: string;
  memberName: string;
}) {
  const [state, action, pending] = useActionState(
    reactivateAction,
    initialActionState,
  );
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="id" value={membershipId} />
      <ActionMessage state={state} />
      <div>
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          disabled={pending}
          aria-busy={pending}
          aria-label={`Rétablir l'accès de ${memberName}`}
        >
          Rétablir l&apos;accès
        </Button>
      </div>
    </form>
  );
}
