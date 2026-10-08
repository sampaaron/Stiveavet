import { Check } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import type { OnboardingStep } from "@/domains/reglages/service";
import { ONBOARDING_STEPS } from "@/domains/reglages/service";
import { appText } from "@/i18n/app/server";
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

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await appText();
  return { title: t.settings.onboarding.title };
}

export default async function OnboardingPage() {
  const context = await requirePermission("organization.settings");
  const settings = services.settings();
  const [onboarding, view] = await Promise.all([
    settings.onboarding(context),
    settings.get(context),
  ]);
  const { steps } = onboarding;
  const { t } = await appText();
  const text = t.settings.onboarding;
  const canLaunch = context.permissions.has("followups.launch");
  const rulesMissing = [
    view.messageWindows.length === 0 ? text.rules.missingWindows : null,
    Object.keys(view.instructions).length < 4
      ? text.rules.missingInstructions
      : null,
    view.contacts.length === 0 ? text.rules.missingContact : null,
  ].filter((item): item is string => item !== null);

  const body: Record<OnboardingStep, ReactNode> = {
    organization: <p className="text-sm text-ink-muted">{text.organization}</p>,
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
        <p className="text-ink-muted">{text.rules.body}</p>
        {rulesMissing.length > 0 ? (
          <p>{text.rules.toComplete(rulesMissing)}</p>
        ) : null}
        <div className="flex flex-wrap items-start gap-3">
          {view.messageWindows.length === 0 ||
          Object.keys(view.instructions).length < 4 ? (
            <ApplyDefaultsForm label={t.settings.applyDefaults} />
          ) : null}
          <ButtonLink href="/app/reglages" variant="secondary">
            {text.rules.open}
          </ButtonLink>
        </div>
      </div>
    ),
    team: (
      <div className="grid gap-3 text-sm">
        <p className="text-ink-muted">{text.team.body}</p>
        <div className="flex flex-wrap items-start gap-3">
          {steps.team ? null : <CompleteTeamForm />}
          <ButtonLink href="/app/equipe" variant="secondary">
            {text.team.open}
          </ButtonLink>
        </div>
      </div>
    ),
    protocols: (
      <div className="grid gap-3 text-sm">
        <p className="text-ink-muted">{text.protocols.body}</p>
        <div>
          <ButtonLink href="/app/protocoles" variant="secondary">
            {text.protocols.open}
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
        <p className="text-ink-muted">{text.testFollowup.body}</p>
        {steps.test_followup ? null : !canLaunch ? (
          <p>{text.testFollowup.notAllowed}</p>
        ) : onboarding.validatedProtocols.length === 0 ? (
          <p>{text.testFollowup.validateFirst}</p>
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
      <PageHeader title={text.title} description={text.description} />
      <div className="grid gap-6">
        <div className="grid gap-2">
          <p className="text-sm font-semibold" id="progression">
            {text.progress(onboarding.completed, ONBOARDING_STEPS.length)}
          </p>
          <progress
            aria-labelledby="progression"
            value={onboarding.completed}
            max={ONBOARDING_STEPS.length}
            className="h-2 w-full max-w-md overflow-hidden rounded-full [&::-moz-progress-bar]:bg-brand [&::-webkit-progress-bar]:bg-canvas-subtle [&::-webkit-progress-value]:bg-brand"
          />
        </div>
        {onboarding.completed === ONBOARDING_STEPS.length ? (
          <AlertBanner tone="success" title={text.ready.title}>
            {text.ready.body}
          </AlertBanner>
        ) : null}
        <AlertBanner tone="info" title={text.simulated.title}>
          {text.simulated.body}
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
                  {text.steps[step]}
                  <span
                    className={cn(
                      "text-sm font-medium",
                      steps[step] ? "text-brand-ink" : "text-ink-muted",
                    )}
                  >
                    · {steps[step] ? text.done : text.todo}
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
