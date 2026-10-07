import { Check } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import type { OnboardingStep } from "@/domains/reglages/service";
import { ONBOARDING_STEPS } from "@/domains/reglages/service";
import { requirePermission } from "@/server/authz";
import { services } from "@/server/services";
import { AlertBanner } from "@/ui/alert-banner";
import { ButtonLink } from "@/ui/button";
import { Card } from "@/ui/card";
import { cn } from "@/ui/cn";
import { PageHeader } from "@/ui/page-header";

import { IntegrationPanel } from "../reglages/integrations";
import {
  ApplyDefaultsForm,
  CompleteTeamForm,
  TestFollowupForm,
} from "../reglages/settings-forms";

export const metadata: Metadata = { title: "Démarrage guidé" };

const TITLES: Record<OnboardingStep, string> = {
  organization: "Cabinet et compte administrateur",
  whatsapp: "Connexion WhatsApp Business",
  drveto: "Connexion dr.veto",
  rules: "Horaires, urgences, garde et alertes",
  team: "Utilisateurs et droits",
  protocols: "Protocoles de départ",
  billing: "Mandat de prélèvement et facturation",
  test_followup: "Premier suivi test",
};

export default async function OnboardingPage() {
  const context = await requirePermission("organization.settings");
  const settings = services.settings();
  const [onboarding, view] = await Promise.all([
    settings.onboarding(context),
    settings.get(context),
  ]);
  const { steps } = onboarding;
  const canLaunch = context.permissions.has("followups.launch");
  const rulesMissing = [
    view.messageWindows.length === 0 ? "les horaires d'envoi" : null,
    Object.keys(view.instructions).length < 4
      ? "les consignes d'urgence"
      : null,
    view.contacts.length === 0 ? "un contact d'urgence" : null,
  ].filter((item): item is string => item !== null);

  const body: Record<OnboardingStep, ReactNode> = {
    organization: (
      <p className="text-sm text-ink-muted">
        Créés à l&apos;inscription. Vous êtes vétérinaire administrateur.
      </p>
    ),
    whatsapp: (
      <IntegrationPanel
        provider="whatsapp"
        connection={view.integrations.whatsapp}
      />
    ),
    drveto: (
      <IntegrationPanel
        provider="drveto"
        connection={view.integrations.drveto}
      />
    ),
    rules: (
      <div className="grid gap-3 text-sm">
        <p className="text-ink-muted">
          Horaires d&apos;envoi de Numa, consignes d&apos;urgence pour la
          journée, la nuit, le week-end et les jours fériés, contacts
          d&apos;urgence, planning de garde et délai d&apos;escalade.
        </p>
        {rulesMissing.length > 0 ? (
          <p>À compléter : {rulesMissing.join(", ")}.</p>
        ) : null}
        <div className="flex flex-wrap items-start gap-3">
          {view.messageWindows.length === 0 ||
          Object.keys(view.instructions).length < 4 ? (
            <ApplyDefaultsForm label="Appliquer les réglages de départ" />
          ) : null}
          <ButtonLink href="/app/reglages" variant="secondary">
            Ouvrir les réglages
          </ButtonLink>
        </div>
      </div>
    ),
    team: (
      <div className="grid gap-3 text-sm">
        <p className="text-ink-muted">
          Invitez vos vétérinaires et assistants, ou passez cette étape si vous
          exercez sans équipe. Vous pourrez inviter plus tard.
        </p>
        <div className="flex flex-wrap items-start gap-3">
          {steps.team ? null : <CompleteTeamForm />}
          <ButtonLink href="/app/equipe" variant="secondary">
            Ouvrir l&apos;équipe
          </ButtonLink>
        </div>
      </div>
    ),
    protocols: (
      <div className="grid gap-3 text-sm">
        <p className="text-ink-muted">
          Ajoutez les modèles de la bibliothèque, relisez-les et validez au
          moins un protocole du cabinet. Un protocole non validé ne sert à aucun
          suivi.
        </p>
        <div>
          <ButtonLink href="/app/protocoles" variant="secondary">
            Ouvrir les protocoles
          </ButtonLink>
        </div>
      </div>
    ),
    billing: (
      <IntegrationPanel
        provider="payment_mandate"
        connection={view.integrations.payment_mandate}
      />
    ),
    test_followup: (
      <div className="grid gap-3 text-sm">
        <p className="text-ink-muted">
          Un animal et un propriétaire fictifs, en brouillon : le suivi test
          n&apos;envoie aucun message, n&apos;est pas compté et n&apos;est pas
          facturé.
        </p>
        {steps.test_followup ? null : !canLaunch ? (
          <p>Le lancement de suivis n&apos;est pas dans vos droits.</p>
        ) : onboarding.validatedProtocols.length === 0 ? (
          <p>Validez d&apos;abord un protocole du cabinet.</p>
        ) : (
          <TestFollowupForm
            protocols={onboarding.validatedProtocols.map((protocol) => ({
              value: protocol.id,
              label: protocol.name,
            }))}
          />
        )}
      </div>
    ),
  };

  return (
    <>
      <PageHeader
        title="Démarrage guidé"
        description="Huit étapes, de cinq à quinze minutes avec les réglages de départ. Chaque réglage reste modifiable ensuite."
      />
      <div className="grid gap-6">
        <div className="grid gap-2">
          <p className="text-sm font-semibold" id="progression">
            {onboarding.completed} étape(s) terminée(s) sur{" "}
            {ONBOARDING_STEPS.length}
          </p>
          <progress
            aria-labelledby="progression"
            value={onboarding.completed}
            max={ONBOARDING_STEPS.length}
            className="h-2 w-full max-w-md overflow-hidden rounded-full [&::-moz-progress-bar]:bg-brand [&::-webkit-progress-bar]:bg-canvas-subtle [&::-webkit-progress-value]:bg-brand"
          />
        </div>
        {onboarding.completed === ONBOARDING_STEPS.length ? (
          <AlertBanner tone="success" title="Votre cabinet est prêt.">
            Vous pouvez lancer vos premiers suivis.
          </AlertBanner>
        ) : null}
        <AlertBanner
          tone="info"
          title="Connexions simulées pendant cette phase."
        >
          Aucun numéro WhatsApp, cabinet dr.veto ou compte bancaire réel
          n&apos;est contacté.
        </AlertBanner>
        <ol className="grid gap-4">
          {ONBOARDING_STEPS.map((step, index) => (
            <li key={step}>
              <Card className="grid gap-3 p-5 sm:p-6">
                <h2 className="flex flex-wrap items-center gap-x-3 gap-y-1 font-bold">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                      steps[step]
                        ? "bg-brand text-white"
                        : "border border-line bg-surface text-ink-muted",
                    )}
                  >
                    {steps[step] ? <Check className="size-4" /> : index + 1}
                  </span>
                  {TITLES[step]}
                  <span
                    className={cn(
                      "text-sm font-medium",
                      steps[step] ? "text-brand-ink" : "text-ink-muted",
                    )}
                  >
                    · {steps[step] ? "terminée" : "à faire"}
                  </span>
                </h2>
                <div className="min-w-0 sm:pl-11">{body[step]}</div>
              </Card>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}
