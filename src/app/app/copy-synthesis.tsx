"use client";

import { Check, ClipboardCopy } from "lucide-react";
import { useState } from "react";

import { useAppText } from "@/i18n/app/client";
import { Button } from "@/ui/button";

import { recordSynthesisCopyAction } from "./synthesis-actions";

/**
 * « Copier pour dr.veto » (ADR 0048) : la synthèse va dans le presse-papiers, la personne la
 * colle elle-même dans dr.veto. La copie est notée au journal, sans son contenu.
 */
export function CopySynthesisButton({
  followupId,
  animalName,
  text,
}: {
  followupId: string;
  animalName: string;
  text: string;
}) {
  const words = useAppText().dossier.synthesis.copy;
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setState("failed");
      return;
    }
    setState("copied");
    const form = new FormData();
    form.set("followupId", followupId);
    await recordSynthesisCopyAction(form);
  }
  return (
    <div className="grid justify-items-start gap-1.5">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={() => void copy()}
        icon={
          state === "copied" ? (
            <Check aria-hidden="true" className="size-4" />
          ) : (
            <ClipboardCopy aria-hidden="true" className="size-4" />
          )
        }
      >
        {words.button}
        <span className="sr-only">{words.forAnimal(animalName)}</span>
      </Button>
      <p role="status" className="text-xs text-ink-muted">
        {state === "copied"
          ? words.copied
          : state === "failed"
            ? words.failed
            : null}
      </p>
    </div>
  );
}
