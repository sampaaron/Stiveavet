import type { Integration, SettingsView } from "@/domains/reglages/service";
import { formatDate } from "@/ui/format";

import { ConnectForm, DisconnectForm } from "./settings-forms";

type Field = { label: string; type: "tel" | "text"; hint: string };

export const INTEGRATIONS: Record<
  Integration,
  { title: string; description: string; submitLabel: string; field?: Field }
> = {
  whatsapp: {
    title: "WhatsApp Business",
    description:
      "Le numéro professionnel du cabinet, d'où Numa écrit aux propriétaires et où arrivent les alertes urgentes.",
    submitLabel: "Connecter le numéro (simulé)",
    field: {
      label: "Numéro WhatsApp Business",
      type: "tel",
      hint: "Seuls les deux derniers chiffres sont conservés.",
    },
  },
  drveto: {
    title: "dr.veto",
    description:
      "Le logiciel du cabinet, pour retrouver l'animal, le propriétaire et l'agenda.",
    submitLabel: "Connecter dr.veto (simulé)",
    field: {
      label: "Code du cabinet dr.veto",
      type: "text",
      hint: "Code fictif, par exemple CAB-1234.",
    },
  },
  payment_mandate: {
    title: "Mandat de prélèvement",
    description:
      "Pour l'essai pilote à 86 € HT par mois. Aucune donnée bancaire n'est demandée pendant cette phase.",
    submitLabel: "Signer le mandat (simulé)",
  },
};

export function SimulatedBadge() {
  return (
    <span className="rounded-full bg-watch-soft px-2 py-0.5 text-[12px] font-semibold text-watch">
      Simulé
    </span>
  );
}

/** État d'une connexion simulée : libellé masqué, ou formulaire de connexion. */
export function IntegrationPanel({
  provider,
  connection,
  headingLevel = 3,
}: {
  provider: Integration;
  connection: SettingsView["integrations"][Integration];
  headingLevel?: 2 | 3;
}) {
  const { title, description, submitLabel, field } = INTEGRATIONS[provider];
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Heading className="flex items-center gap-2 font-semibold">
            {title} <SimulatedBadge />
          </Heading>
          <p className="text-sm text-ink-muted">{description}</p>
        </div>
        {connection ? (
          <DisconnectForm provider={provider} label={title} />
        ) : null}
      </div>
      {connection ? (
        <p className="text-sm">
          <span className="font-semibold">Connecté</span> :{" "}
          {connection.displayLabel}, depuis le{" "}
          {formatDate(connection.connectedAt)}.
        </p>
      ) : (
        <ConnectForm
          provider={provider}
          submitLabel={submitLabel}
          field={field}
        />
      )}
    </div>
  );
}

export function IntegrationList({
  integrations,
}: {
  integrations: SettingsView["integrations"];
}) {
  return (
    <div className="grid gap-6">
      {(Object.keys(INTEGRATIONS) as Integration[]).map((provider, index) => (
        <div
          key={provider}
          className={index > 0 ? "border-t border-line pt-6" : undefined}
        >
          <IntegrationPanel
            provider={provider}
            connection={integrations[provider]}
          />
        </div>
      ))}
    </div>
  );
}
