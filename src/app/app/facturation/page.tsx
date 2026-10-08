import type { Metadata } from "next";

import type { Access } from "@/domains/facturation/rules";
import {
  INCLUDED_ACTIVE_FOLLOWUPS,
  LAUNCH_SURCHARGE_CENTS,
  PLANS,
  PLAN_CATALOG,
  REACTIVATION_SURCHARGE_CENTS,
  TRIAL_MONTHS,
  cancellationEffectiveAt,
} from "@/domains/facturation/rules";
import type { BillingOverview } from "@/domains/facturation/service";
import { appText } from "@/i18n/app/server";
import type { AppDictionary } from "@/i18n/app/types";
import type { Locale } from "@/i18n/locales";
import { requirePermission } from "@/server/authz";
import { services } from "@/server/services";
import { AlertBanner } from "@/ui/alert-banner";
import { ButtonLink } from "@/ui/button";
import { CapacityMeter } from "@/ui/capacity-meter";
import { Card, SectionCard } from "@/ui/card";
import { formatDate, formatEuros } from "@/ui/format";
import { PageHeader } from "@/ui/page-header";
import { EmptyState } from "@/ui/states";

import {
  CancelForm,
  CommitAnnualForm,
  PlanForm,
  SettleForm,
  StayMonthlyForm,
} from "./billing-forms";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await appText();
  return { title: t.billing.title };
}

export default async function BillingPage() {
  const context = await requirePermission("billing.manage");
  const [overview, { t, locale }] = await Promise.all([
    services.billing().overview(context),
    appText(),
  ]);
  const { facts } = overview;
  const text = t.billing;
  const euros = (cents: number) => formatEuros(cents, locale);
  const date = (value: Date) => formatDate(value, locale);

  if (!facts)
    return (
      <>
        <PageHeader title={text.title} />
        <Card>
          <EmptyState
            title={text.noSubscription.title}
            description={text.noSubscription.description}
          />
        </Card>
      </>
    );

  const plan = PLAN_CATALOG[facts.plan];
  const planText = t.labels.plans[facts.plan];
  const now = new Date();
  const editable =
    !facts.canceledAt &&
    overview.access.kind !== "read_only" &&
    overview.access.kind !== "closed";

  return (
    <>
      <PageHeader title={text.title} description={text.description} />
      <div className="grid gap-6">
        <AccessBanner access={overview.access} t={t} locale={locale} />
        {!overview.mandateSigned ? (
          <AlertBanner
            tone="watch"
            title={text.mandate.title}
            action={
              <ButtonLink href="/app/demarrage" variant="secondary" size="sm">
                {text.mandate.action}
              </ButtonLink>
            }
          >
            {text.mandate.body}
          </AlertBanner>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Card className="p-5">
            <p className="text-sm font-medium text-ink-muted">{text.plan}</p>
            <p className="mt-2 text-2xl font-bold tracking-tight">
              {planText.name}
            </p>
            <p className="mt-1 text-sm text-ink-muted">
              {phaseLabel(overview, t, locale)}
            </p>
          </Card>
          <Card className="p-5">
            <p className="text-sm font-medium text-ink-muted">
              {text.next.title}
            </p>
            <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">
              {overview.nextPriceCents !== null
                ? text.exclVat(euros(overview.nextPriceCents))
                : text.next.none}
            </p>
            <p className="mt-1 text-sm text-ink-muted">
              {overview.nextPriceCents !== null && overview.period
                ? overview.pending.amountCents
                  ? text.next.onWithSurcharges(
                      date(overview.period.end),
                      euros(overview.pending.amountCents),
                    )
                  : text.next.on(date(overview.period.end))
                : facts.endsAt
                  ? text.next.cancelled(date(facts.endsAt))
                  : ""}
            </p>
          </Card>
          <Card className="p-5 sm:col-span-2 xl:col-span-1">
            <p className="text-sm font-medium text-ink-muted">
              {text.activeFollowups.title}
            </p>
            <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">
              {text.activeFollowups.count(
                overview.activeFollowups,
                INCLUDED_ACTIVE_FOLLOWUPS,
              )}
            </p>
            <div className="mt-3">
              <CapacityMeter
                used={overview.activeFollowups}
                included={INCLUDED_ACTIVE_FOLLOWUPS}
              />
            </div>
          </Card>
        </div>

        <SectionCard
          title={text.usage.title}
          description={text.usage.description(
            INCLUDED_ACTIVE_FOLLOWUPS,
            euros(LAUNCH_SURCHARGE_CENTS),
            euros(REACTIVATION_SURCHARGE_CENTS),
          )}
        >
          <p className="text-sm">
            {overview.pending.launches + overview.pending.reactivations > 0
              ? text.usage.pending(
                  overview.pending.launches,
                  overview.pending.reactivations,
                  euros(overview.pending.amountCents),
                )
              : text.usage.nonePending}
          </p>
        </SectionCard>

        {editable &&
        (overview.canCommitAnnual || overview.commitmentReminder) ? (
          <SectionCard
            title={text.annual.title}
            description={
              overview.commitmentReminder
                ? text.annual.reminder
                : text.annual.anytime
            }
          >
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="grid content-start gap-2 text-sm">
                <p>
                  {text.annual.prices(
                    euros(plan.annualMonthlyCents),
                    euros(plan.monthlyCents),
                  )}
                </p>
                {overview.canCommitAnnual ? (
                  <CommitAnnualForm
                    priceLabel={euros(plan.annualMonthlyCents)}
                  />
                ) : null}
              </div>
              {overview.commitmentReminder ? (
                <div className="grid content-start gap-2 text-sm">
                  <p>{text.annual.stayMonthlyIntro}</p>
                  <StayMonthlyForm />
                </div>
              ) : null}
            </div>
          </SectionCard>
        ) : null}

        {editable && facts.cycle === "monthly" ? (
          <SectionCard
            title={text.changePlan.title}
            description={text.changePlan.description(
              overview.vetSeats,
              overview.phase === "trial" ? TRIAL_MONTHS : null,
            )}
          >
            <PlanForm
              current={facts.plan}
              options={PLANS.map((key) => {
                const option = PLAN_CATALOG[key];
                const names = t.labels.plans[key];
                return {
                  value: key,
                  label: text.changePlan.option(
                    names.name,
                    euros(option.monthlyCents),
                  ),
                  detail: text.changePlan.optionDetail(
                    option.maxVets,
                    names.stive,
                  ),
                  disabled: overview.vetSeats > option.maxVets,
                };
              })}
            />
          </SectionCard>
        ) : null}

        <SectionCard
          title={text.invoices.title}
          description={text.invoices.description}
        >
          {overview.invoices.length ? (
            <ul className="grid gap-3">
              {overview.invoices.map((invoice) => (
                <li key={invoice.id}>
                  <details className="group rounded-[var(--radius-control)] border border-line">
                    <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-x-4 gap-y-1 p-3 text-sm">
                      <span>
                        <span className="font-semibold">{invoice.number}</span>
                        <span className="text-ink-muted">
                          {" "}
                          ·{" "}
                          {text.invoices.period(
                            date(invoice.periodStart),
                            date(invoice.periodEnd),
                          )}
                        </span>
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="tabular-nums">
                          {text.inclVat(euros(invoice.totalCents))}
                        </span>
                        <span
                          className={
                            invoice.status === "paid"
                              ? "font-semibold text-brand-ink"
                              : invoice.status === "failed"
                                ? "font-semibold text-urgent"
                                : "font-semibold text-watch"
                          }
                        >
                          {text.invoices.status[invoice.status]}
                        </span>
                      </span>
                    </summary>
                    <dl className="grid gap-1 border-t border-line p-3 text-sm">
                      {invoice.lines.map((line) => (
                        <div
                          key={line.label}
                          className="flex justify-between gap-4"
                        >
                          <dt className="text-ink-muted">{line.label}</dt>
                          <dd className="tabular-nums">
                            {euros(line.amountCents)}
                          </dd>
                        </div>
                      ))}
                      <div className="flex justify-between gap-4">
                        <dt className="text-ink-muted">{text.invoices.vat}</dt>
                        <dd className="tabular-nums">
                          {euros(invoice.vatCents)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4 font-semibold">
                        <dt>{text.invoices.total}</dt>
                        <dd className="tabular-nums">
                          {euros(invoice.totalCents)}
                        </dd>
                      </div>
                    </dl>
                  </details>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-muted">{text.invoices.none}</p>
          )}
        </SectionCard>

        {editable ? (
          <SectionCard
            title={text.cancel.title}
            description={text.cancel.description}
          >
            <CancelForm
              effectiveLabel={date(cancellationEffectiveAt(facts, now))}
            />
          </SectionCard>
        ) : null}
      </div>
    </>
  );
}

function phaseLabel(
  overview: BillingOverview,
  t: AppDictionary,
  locale: Locale,
): string {
  const { facts, month } = overview;
  if (!facts || !month) return "";
  const phase = t.billing.phase;
  if (overview.phase === "trial")
    return phase.trial(
      month,
      TRIAL_MONTHS,
      formatEuros(PLAN_CATALOG[facts.plan].monthlyCents, locale),
    );
  if (facts.cycle === "annual" && facts.annualEndsAt)
    return phase.annualUntil(formatDate(facts.annualEndsAt, locale));
  return phase.monthly(month);
}

function AccessBanner({
  access,
  t,
  locale,
}: {
  access: Access;
  t: AppDictionary;
  locale: Locale;
}) {
  const text = t.billing.access;
  switch (access.kind) {
    case "full":
      return null;
    case "grace":
      return (
        <AlertBanner
          tone="watch"
          title={text.graceTitle(access.daysLeft)}
          action={<SettleForm />}
        >
          {text.graceBody(formatDate(access.blockedAt, locale))}
        </AlertBanner>
      );
    case "blocked":
      return (
        <AlertBanner
          tone="urgent"
          title={text.blockedTitle}
          action={access.reason === "unpaid" ? <SettleForm /> : undefined}
        >
          {access.reason === "unpaid"
            ? text.blockedUnpaid
            : text.blockedCancelled}
        </AlertBanner>
      );
    case "read_only":
      return (
        <AlertBanner
          tone="info"
          title={text.readOnlyTitle(formatDate(access.until, locale))}
          action={access.reason === "unpaid" ? <SettleForm /> : undefined}
        >
          {text.readOnlyBody}
        </AlertBanner>
      );
    case "closed":
      return (
        <AlertBanner tone="info" title={text.closedTitle}>
          {text.closedBody}
        </AlertBanner>
      );
  }
}
