"use client";

import { useActionState } from "react";

import { Button } from "@/ui/button";

import { ActionMessage } from "../action-message";
import { initialActionState } from "../action-state";

import {
  archiveProtocolAction,
  duplicateProtocolAction,
  installLibraryAction,
  validateProtocolAction,
} from "./actions";

export function InstallLibraryForm({
  libraryKey,
  name,
}: {
  libraryKey: string;
  name: string;
}) {
  const [state, action, pending] = useActionState(
    installLibraryAction,
    initialActionState,
  );
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="key" value={libraryKey} />
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        disabled={pending}
        aria-label={`Ajouter « ${name} » au cabinet`}
      >
        Ajouter au cabinet
      </Button>
      <ActionMessage state={state} />
    </form>
  );
}

export function ValidateProtocolForm({ protocolId }: { protocolId: string }) {
  const [state, action, pending] = useActionState(
    validateProtocolAction,
    initialActionState,
  );
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="protocolId" value={protocolId} />
      <p className="text-sm text-ink-muted">
        En validant, vous confirmez avoir relu les étapes et les signes
        d&apos;alerte de cette version.
      </p>
      <ActionMessage state={state} />
      <div>
        <Button type="submit" disabled={pending} aria-busy={pending}>
          Valider ce protocole
        </Button>
      </div>
    </form>
  );
}

export function DuplicateProtocolForm({
  protocolId,
  scope,
  label,
}: {
  protocolId: string;
  scope: "cabinet" | "personal";
  label: string;
}) {
  const [state, action, pending] = useActionState(
    duplicateProtocolAction,
    initialActionState,
  );
  return (
    <form action={action} className="grid gap-1">
      <input type="hidden" name="protocolId" value={protocolId} />
      <input type="hidden" name="scope" value={scope} />
      <Button
        type="submit"
        variant="secondary"
        className="w-full"
        disabled={pending}
        aria-busy={pending}
      >
        {label}
      </Button>
      <ActionMessage state={state} />
    </form>
  );
}

export function ArchiveProtocolForm({
  protocolId,
  archived,
}: {
  protocolId: string;
  archived: boolean;
}) {
  const [state, action, pending] = useActionState(
    archiveProtocolAction,
    initialActionState,
  );
  return (
    <form action={action} className="grid gap-1">
      <input type="hidden" name="protocolId" value={protocolId} />
      <input type="hidden" name="archived" value={String(!archived)} />
      <Button
        type="submit"
        variant="quiet"
        className="w-full"
        disabled={pending}
        aria-busy={pending}
      >
        {archived ? "Restaurer le protocole" : "Archiver le protocole"}
      </Button>
      <ActionMessage state={state} />
    </form>
  );
}
