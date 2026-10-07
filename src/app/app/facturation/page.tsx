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
  formatEuros,
} from "@/domains/facturation/rules";
import type { BillingOverview } from "@/domains/facturation/service";
import { requirePermission } from "@/server/authz";
import { services } from "@/server/services";
import { AlertBanner } from "@/ui/alert-banner";
import { ButtonLink } from "@/ui/button";
import { CapacityMeter } from "@/ui/capacity-meter";
import { Card, SectionCard } from "@/ui/card";
import { formatDate } from "@/ui/format";
import { PageHeader } from "@/ui/page-header";
import { EmptyState } from "@/ui/states";

import {
  CancelForm,
  CommitAnnualForm,
  PlanForm,
  SettleForm,
  StayMonthlyForm,
} from "./billing-forms";

export const metadata: Metadata = { title: "Facturation" };

const STATUS_LABELS = {
  paid: "Payée",
  open: "À prélever",
  failed: "Prélèvement refusé",
} as const;

export default async function BillingPage() {
  const context = await requirePermission("billing.manage");
  const overview = await services.billing().overview(context);
  const { facts } = overview;

  if (!facts)
    return (
      <>
        <PageHeader title="Facturation" />
        <Card>
          <EmptyState
            title="Aucun abonnement enregistré"
            description="Ce cabinet a été créé avant la facturation. Contactez le support pour choisir votre formule."
          />
        </Card>
      </>
    );

  const plan = PLAN_CATALOG[facts.plan];
  const now = new Date();
  const editable =
    !facts.canceledAt &&
    overview.access.kind !== "read_only" &&
    overview.access.kind !== "closed";

  return (
    <>
      <PageHeader
        title="Facturation"
        description="Prix hors taxes, facturés au cabinet et prélevés chaque mois. Prélèvements simulés pendant cette phase : aucun compte bancaire n'est débité."
      />
      <div className="grid gap-6">
        <AccessBanner access={overview.access} />
        {!overview.mandateSigned ? (
          <AlertBanner
            tone="watch"
            title="Mandat de prélèvement à signer"
            action={
              <ButtonLink href="/app/demarrage" variant="secondary" size="sm">
                Ouvrir le démarrage guidé
              </ButtonLink>
            }
          >
            Les factures restent à prélever tant que le mandat n&apos;est pas
            signé.
          </AlertBanner>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Card className="p-5">
            <p className="text-sm font-medium text-ink-muted">Formule</p>
            <p className="mt-2 text-2xl font-bold tracking-tight">
              {plan.label}
            </p>
            <p className="mt-1 text-sm text-ink-muted">
              {phaseLabel(overview)}
            </p>
          </Card>
          <Card className="p-5">
            <p className="text-sm font-medium text-ink-muted">
              Prochain prélèvement
            </p>
            <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">
              {overview.nextPriceCents !== null
                ? `${formatEuros(overview.nextPriceCents)} HT`
                : "Aucun"}
            </p>
            <p className="mt-1 text-sm text-ink-muted">
              {overview.nextPriceCents !== null && overview.period
                ? `Le ${formatDate(overview.period.end)}${overview.pending.amountCents ? `, plus ${formatEuros(overview.pending.amountCents)} HT de suppléments` : ""}`
                : facts.endsAt
                  ? `Abonnement résilié, effectif le ${formatDate(facts.endsAt)}`
                  : ""}
            </p>
          </Card>
          <Card className="p-5 sm:col-span-2 xl:col-span-1">
            <p className="text-sm font-medium text-ink-muted">Suivis actifs</p>
            <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">
              {overview.activeFollowups} / {INCLUDED_ACTIVE_FOLLOWUPS} inclus
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
          title="Usage de Numa"
          description={`${INCLUDED_ACTIVE_FOLLOWUPS} suivis actifs en même temps sont inclus. Au-delà, chaque nouveau suivi coûte ${formatEuros(LAUNCH_SURCHARGE_CENTS)} HT et chaque réactivation ${formatEuros(REACTIVATION_SURCHARGE_CENTS)} HT, prélevés avec l'abonnement suivant. Un suivi terminé libère sa place ; les suivis test ne comptent pas.`}
        >
          <p className="text-sm">
            {overview.pending.launches + overview.pending.reactivations > 0
              ? `En attente de facturation : ${overview.pending.launches} lancement(s) et ${overview.pending.reactivations} réactivation(s), soit ${formatEuros(overview.pending.amountCents)} HT.`
              : "Aucun supplément en attente."}
          </p>
        </SectionCard>

        {editable &&
        (overview.canCommitAnnual || overview.commitmentReminder) ? (
          <SectionCard
            title="Engagement annuel"
            description={
              overview.commitmentReminder
                ? "À choisir avant le 7e mois. Sans réponse, vous restez au mois, au tarif sans engagement : rien ne bascule automatiquement."
                : "Possible à tout moment, sur votre demande uniquement."
            }
          >
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="grid content-start gap-2 text-sm">
                <p>
                  Avec engagement : {formatEuros(plan.annualMonthlyCents)} HT
                  par mois pendant 12 mois. Sans engagement :{" "}
                  {formatEuros(plan.monthlyCents)} HT par mois.
                </p>
                {overview.canCommitAnnual ? (
                  <CommitAnnualForm
                    priceLabel={formatEuros(plan.annualMonthlyCents)}
                  />
                ) : null}
              </div>
              {overview.commitmentReminder ? (
                <div className="grid content-start gap-2 text-sm">
                  <p>
                    Vous préférez garder la liberté de résilier chaque mois.
                  </p>
                  <StayMonthlyForm />
                </div>
              ) : null}
            </div>
          </SectionCard>
        ) : null}

        {editable && facts.cycle === "monthly" ? (
          <SectionCard
            title="Changer de formule"
            description={`La nouvelle formule s'applique à la prochaine échéance${overview.phase === "trial" ? `, après les ${TRIAL_MONTHS} mois d'essai` : ""}. Votre équipe compte ${overview.vetSeats} vétérinaire(s), invitations en attente comprises.`}
          >
            <PlanForm
              current={facts.plan}
              options={PLANS.map((key) => {
                const option = PLAN_CATALOG[key];
                return {
                  value: key,
                  label: `${option.label} · ${formatEuros(option.monthlyCents)} HT par mois`,
                  detail: `${option.maxVets === 1 ? "1 vétérinaire" : `Jusqu'à ${option.maxVets} vétérinaires`}. ${option.stive}.`,
                  disabled: overview.vetSeats > option.maxVets,
                };
              })}
            />
          </SectionCard>
        ) : null}

        <SectionCard
          title="Factures"
          description="Montants hors taxes et TVA à 20 %. Factures simulées pendant cette phase."
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
                          · du {formatDate(invoice.periodStart)} au{" "}
                          {formatDate(invoice.periodEnd)}
                        </span>
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="tabular-nums">
                          {formatEuros(invoice.totalCents)} TTC
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
                          {STATUS_LABELS[invoice.status]}
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
                            {formatEuros(line.amountCents)}
                          </dd>
                        </div>
                      ))}
                      <div className="flex justify-between gap-4">
                        <dt className="text-ink-muted">TVA 20 %</dt>
                        <dd className="tabular-nums">
                          {formatEuros(invoice.vatCents)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4 font-semibold">
                        <dt>Total TTC</dt>
                        <dd className="tabular-nums">
                          {formatEuros(invoice.totalCents)}
                        </dd>
                      </div>
                    </dl>
                  </details>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-muted">
              Aucune facture pour l&apos;instant.
            </p>
          )}
        </SectionCard>

        {editable ? (
          <SectionCard
            title="Résilier"
            description="Vos suivis en cours continuent jusqu'à leur fin, pour ne laisser aucun propriétaire sans réponse. Aucun nouveau suivi n'est possible après la date d'effet. Quand le dernier suivi se termine, le cabinet garde un accès en lecture seule pendant 3 mois."
          >
            <CancelForm
              effectiveLabel={formatDate(cancellationEffectiveAt(facts, now))}
            />
          </SectionCard>
        ) : null}
      </div>
    </>
  );
}

function phaseLabel(overview: BillingOverview): string {
  const { facts, month } = overview;
  if (!facts || !month) return "";
  if (overview.phase === "trial")
    return `Essai pilote, mois ${month} sur ${TRIAL_MONTHS}, puis ${formatEuros(PLAN_CATALOG[facts.plan].monthlyCents)} HT par mois`;
  if (facts.cycle === "annual" && facts.annualEndsAt)
    return `Engagement annuel jusqu'au ${formatDate(facts.annualEndsAt)}`;
  return `Sans engagement, mois ${month} de votre abonnement`;
}

function AccessBanner({ access }: { access: Access }) {
  switch (access.kind) {
    case "full":
      return null;
    case "grace":
      return (
        <AlertBanner
          tone="watch"
          title={`Prélèvement refusé : ${access.daysLeft} jour(s) pour régulariser`}
          action={<SettleForm />}
        >
          Après le {formatDate(access.blockedAt)}, les nouveaux suivis seront
          suspendus. Les suivis en cours continuent dans tous les cas.
        </AlertBanner>
      );
    case "blocked":
      return (
        <AlertBanner
          tone="urgent"
          title="Nouveaux suivis suspendus"
          action={access.reason === "unpaid" ? <SettleForm /> : undefined}
        >
          {access.reason === "unpaid"
            ? "Le paiement n'a pas été régularisé dans les 30 jours. Vos suivis en cours continuent jusqu'à leur fin."
            : "L'abonnement est résilié. Vos suivis en cours continuent jusqu'à leur fin."}
        </AlertBanner>
      );
    case "read_only":
      return (
        <AlertBanner
          tone="info"
          title={`Accès en lecture seule jusqu'au ${formatDate(access.until)}`}
          action={access.reason === "unpaid" ? <SettleForm /> : undefined}
        >
          Plus aucun suivi n&apos;est en cours. Vous pouvez consulter
          l&apos;historique ; un export PDF est disponible sur demande au
          support.
        </AlertBanner>
      );
    case "closed":
      return (
        <AlertBanner tone="info" title="Accès au cabinet terminé">
          La période de lecture seule est terminée. Contactez le support pour
          toute demande d&apos;export.
        </AlertBanner>
      );
  }
}
