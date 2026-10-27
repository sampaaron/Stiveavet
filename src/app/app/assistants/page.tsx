import { Check, X } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import type { PermissionKey } from "@/domains/equipe/permissions";
import { appText } from "@/i18n/app/server";
import { memberContext } from "@/server/authz";
import { services } from "@/server/services";
import { AiBadge, AssistantAvatar } from "@/ui/assistant-card";
import type { Assistant } from "@/ui/assistant-card";
import { ButtonLink } from "@/ui/button";
import { Card } from "@/ui/card";
import { PageHeader } from "@/ui/page-header";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await appText();
  return { title: t.hub.assistants.title };
}

/** Ce que fait un assistant, ou ce qu'il ne fait jamais. */
function Rules({
  title,
  items,
  allowed,
}: {
  title: string;
  items: readonly string[];
  allowed: boolean;
}) {
  const Icon = allowed ? Check : X;
  return (
    <div>
      <h3 className="mb-2 text-sm font-bold">{title}</h3>
      <ul className="grid gap-2 text-sm">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <Icon
              aria-hidden="true"
              className={
                allowed
                  ? "mt-0.5 size-4 shrink-0 text-brand"
                  : "mt-0.5 size-4 shrink-0 text-urgent"
              }
            />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AssistantPanel({
  assistant,
  name,
  talksTo,
  children,
  footer,
}: {
  assistant: Assistant;
  name: string;
  talksTo: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-5 p-5 sm:p-7">
      <div className="flex items-center gap-4">
        <AssistantAvatar
          assistant={assistant}
          size={88}
          className="size-16 ring-4 ring-accent/10 sm:size-22"
        />
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2 text-xl font-bold">
            {name}
            <AiBadge assistant={assistant} />
          </h2>
          <p className="mt-1 text-sm text-ink-muted">{talksTo}</p>
        </div>
      </div>
      {children}
      <div className="mt-auto flex flex-wrap gap-2">{footer}</div>
    </Card>
  );
}

/**
 * Assistants IA (ADR 0044) : Numa, côté propriétaires, et Stive, côté équipe, chacun avec ce
 * qu'il fait et ce qu'il ne fait jamais. Ouvert à toute l'équipe ; les liens et le décompte
 * des demandes suivent les droits de la personne.
 */
export default async function AssistantsPage() {
  const context = await memberContext();
  const can = (key: PermissionKey) => context.permissions.has(key);
  const { t } = await appText();
  const text = t.hub.assistants;
  const usage = can("stive.use")
    ? (await services.stive().conversation(context)).usage
    : null;
  const canReadFollowups = (
    [
      "followups.read_all",
      "followups.read_own",
      "followups.read_summary",
    ] as const
  ).some(can);

  return (
    <>
      <PageHeader title={text.title} description={text.description} />
      <div className="grid gap-6 lg:grid-cols-2">
        <AssistantPanel
          assistant="numa"
          name="Numa"
          talksTo={text.numa.talksTo}
          footer={
            <>
              {can("organization.settings") ? (
                <ButtonLink href="/app/reglages" variant="secondary">
                  {text.numa.settings}
                </ButtonLink>
              ) : null}
              {canReadFollowups ? (
                <ButtonLink href="/app/suivis" variant="quiet">
                  {text.numa.followups}
                </ButtonLink>
              ) : null}
            </>
          }
        >
          <Rules title={text.numa.doesTitle} items={text.numa.does} allowed />
          <Rules
            title={text.numa.neverTitle}
            items={text.numa.never}
            allowed={false}
          />
        </AssistantPanel>

        <AssistantPanel
          assistant="stive"
          name="Stive"
          talksTo={text.stive.talksTo}
          footer={
            usage ? (
              <ButtonLink href="/app/stive">{text.stive.open}</ButtonLink>
            ) : can("billing.manage") ? (
              <ButtonLink href="/app/stive" variant="secondary">
                {text.stive.seeOffer}
              </ButtonLink>
            ) : null
          }
        >
          <Rules title={text.stive.doesTitle} items={text.stive.does} allowed />
          <Rules
            title={text.stive.neverTitle}
            items={text.stive.never}
            allowed={false}
          />
          {usage ? (
            <div>
              <div className="mb-2 flex justify-between gap-3 text-sm font-semibold">
                <span id="usage-stive">{text.stive.usageLabel}</span>
                <span>{text.stive.usage(usage.used, usage.limit)}</span>
              </div>
              <div
                role="meter"
                aria-labelledby="usage-stive"
                aria-valuemin={0}
                aria-valuemax={usage.limit}
                aria-valuenow={usage.used}
                aria-valuetext={text.stive.usage(usage.used, usage.limit)}
                className="h-2 overflow-hidden rounded-full bg-canvas-subtle"
              >
                <div
                  className="h-full rounded-full bg-accent"
                  style={{
                    width: `${Math.min(usage.used / Math.max(usage.limit, 1), 1) * 100}%`,
                  }}
                />
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink-muted">{text.stive.notIncluded}</p>
          )}
        </AssistantPanel>
      </div>
    </>
  );
}
