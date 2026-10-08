import type { Integration, SettingsView } from "@/domains/reglages/service";
import { appText } from "@/i18n/app/server";
import { formatDate } from "@/ui/format";

import { ConnectForm, DisconnectForm } from "./settings-forms";

/** Champ à saisir pour chaque connexion simulée ; aucun pour le mandat. */
const FIELD_TYPES: Record<Integration, "tel" | "text" | null> = {
  whatsapp: "tel",
  drveto: "text",
  payment_mandate: null,
};

const PROVIDERS = Object.keys(FIELD_TYPES) as Integration[];

export function SimulatedBadge({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-watch-soft px-2 py-0.5 text-[12px] font-semibold text-watch">
      {label}
    </span>
  );
}

/** État d'une connexion simulée : libellé masqué, ou formulaire de connexion. */
export async function IntegrationPanel({
  provider,
  connection,
  headingLevel = 3,
}: {
  provider: Integration;
  connection: SettingsView["integrations"][Integration];
  headingLevel?: 2 | 3;
}) {
  const { t, locale } = await appText();
  const text = t.settings.integrations;
  const copy = text[provider];
  const fieldType = FIELD_TYPES[provider];
  const field =
    fieldType && "field" in copy
      ? { label: copy.field, type: fieldType, hint: copy.hint }
      : undefined;
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Heading className="flex items-center gap-2 font-semibold">
            {copy.title} <SimulatedBadge label={text.simulated} />
          </Heading>
          <p className="text-sm text-ink-muted">{copy.description}</p>
        </div>
        {connection ? (
          <DisconnectForm provider={provider} label={copy.title} />
        ) : null}
      </div>
      {connection ? (
        <p className="text-sm">
          <span className="font-semibold">{text.connected}</span>
          {text.connectedDetail(
            connection.displayLabel,
            formatDate(connection.connectedAt, locale),
          )}
        </p>
      ) : (
        <ConnectForm
          provider={provider}
          submitLabel={copy.submit}
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
      {PROVIDERS.map((provider, index) => (
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
