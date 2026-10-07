"use client";

import { useState } from "react";

import { ConfirmDialog } from "@/ui/dialog";

export function ConfirmDemo() {
  const [result, setResult] = useState("Aucune action confirmée.");
  return (
    <div className="flex flex-wrap items-center gap-4">
      <ConfirmDialog
        triggerLabel="Arrêter le suivi"
        title="Arrêter le suivi de Caramel ?"
        description="Numa n'enverra plus de relance. La conversation WhatsApp reste ouverte et l'historique est conservé."
        confirmLabel="Arrêter le suivi"
        tone="urgent"
        onConfirm={() =>
          setResult("Suivi arrêté (démonstration, rien n'est enregistré).")
        }
      />
      <p className="text-sm text-ink-muted" aria-live="polite">
        {result}
      </p>
    </div>
  );
}
