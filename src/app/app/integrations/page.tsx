import { Bot } from "lucide-react";
import type { Metadata } from "next";

import { configuredAiMode } from "@/adapters/ai-gateway";
import { appText } from "@/i18n/app/server";
import { requirePermission } from "@/server/authz";
import { services } from "@/server/services";
import { Card } from "@/ui/card";
import { PageHeader } from "@/ui/page-header";

import {
  IntegrationPanel,
  PROVIDERS,
  SimulatedBadge,
} from "../reglages/integrations";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await appText();
  return { title: t.hub.integrations.title };
}

/**
 * Intégrations (ADR 0044) : WhatsApp, dr.veto et le mandat de prélèvement, avec leur
 * connexion, puis le fournisseur des assistants IA. Rien de secret n'est affiché : un
 * libellé masqué pour les connexions, le seul nom du fournisseur pour l'IA.
 */
export default async function IntegrationsPage() {
  const context = await requirePermission("organization.settings");
  const [settings, { t }] = await Promise.all([
    services.settings().get(context),
    appText(),
  ]);
  const text = t.hub.integrations;
  const ai = configuredAiMode();

  return (
    <>
      <PageHeader title={text.title} description={text.description} />
      <div className="grid gap-6 lg:grid-cols-2">
        {PROVIDERS.map((provider) => (
          <Card key={provider} className="p-5 sm:p-6">
            <IntegrationPanel
              provider={provider}
              connection={settings.integrations[provider]}
              included={provider !== "drveto" || settings.advancedIntegrations}
              headingLevel={2}
            />
          </Card>
        ))}
        <Card className="grid content-start gap-3 p-5 sm:p-6">
          <h2 className="flex flex-wrap items-center gap-2 font-semibold">
            <Bot aria-hidden="true" className="size-4 text-accent" />
            {text.ai.title}
            {ai === "simulated" ? (
              <SimulatedBadge label={t.settings.integrations.simulated} />
            ) : null}
          </h2>
          <p className="text-sm text-ink-muted">{text.ai.description}</p>
          <p className="text-sm">
            {ai === "simulated"
              ? text.ai.simulated
              : text.ai.connected(text.ai.providers[ai])}
          </p>
        </Card>
      </div>
    </>
  );
}
