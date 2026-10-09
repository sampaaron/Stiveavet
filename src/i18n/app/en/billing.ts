import type { AppDictionary } from "../types";

export const billing: AppDictionary["billing"] = {
  title: "Billing",
  description:
    "Prices excl. VAT, invoiced to the practice and collected every month. Direct debits are simulated during this phase: no bank account is charged.",
  descriptionLive:
    "Prices excl. VAT, invoiced to the practice and collected every month by SEPA direct debit, through Stripe.",
  exclVat: (amount: string) => `${amount} excl. VAT`,
  inclVat: (amount: string) => `${amount} incl. VAT`,
  noSubscription: {
    title: "No subscription on record",
    description:
      "This practice was created before billing was set up. Contact support to choose your plan.",
  },
  mandate: {
    title: "Direct debit mandate to sign",
    action: "Open the guided setup",
    body: "Invoices remain outstanding until the mandate is signed.",
  },
  plan: "Plan",
  phase: {
    trial: (month: number, months: number, price: string) =>
      `Pilot trial, month ${month} of ${months}, then ${price} excl. VAT per month`,
    annualUntil: (date: string) => `Annual commitment until ${date}`,
    monthly: (month: number) =>
      `No commitment, month ${month} of your subscription`,
  },
  next: {
    title: "Next direct debit",
    none: "None",
    on: (date: string) => `On ${date}`,
    onWithSurcharges: (date: string, amount: string) =>
      `On ${date}, plus ${amount} excl. VAT in extra charges`,
    cancelled: (date: string) => `Subscription cancelled, effective on ${date}`,
  },
  activeFollowups: {
    title: "Active follow-ups",
    count: (used: number, included: number) => `${used} / ${included} included`,
  },
  usage: {
    title: "Numa usage",
    description: (included: number, launch: string, reactivation: string) =>
      `${included} simultaneous active follow-ups are included. Beyond that, each new follow-up costs ${launch} excl. VAT and each reactivation ${reactivation} excl. VAT, collected with the next subscription payment. A follow-up that ends frees up its place; test follow-ups do not count.`,
    pending: (launches: number, reactivations: number, amount: string) =>
      `Awaiting billing: ${launches} launch${launches === 1 ? "" : "es"} and ${reactivations} reactivation${reactivations === 1 ? "" : "s"}, i.e. ${amount} excl. VAT.`,
    nonePending: "No extra charges pending.",
  },
  annual: {
    title: "Annual commitment",
    reminder:
      "To be decided before month 7. If you do not answer, you stay on monthly billing at the no-commitment rate: nothing switches automatically.",
    anytime: "Possible at any time, only at your request.",
    offer: (trialEnd) =>
      `Your trial ends on ${trialEnd}. You can choose now; if you do not answer, you stay on monthly billing at the no-commitment rate: nothing switches automatically.`,
    prices: (annual: string, monthly: string) =>
      `With commitment: ${annual} excl. VAT per month for 12 months. Without commitment: ${monthly} excl. VAT per month.`,
    stayMonthlyIntro: "You would rather keep the freedom to cancel each month.",
    confirm: (price: string, startsOn: string) =>
      `I commit for 12 months at ${price} excl. VAT per month, collected monthly from ${startsOn}.`,
    submit: "Switch to the annual commitment",
    stayMonthly: "Stay on monthly billing",
  },
  changePlan: {
    title: "Change plan",
    description: (vetSeats: number, trialMonths: number | null) =>
      `The new plan applies from the next billing date${trialMonths ? `, after the ${trialMonths}-month trial` : ""}. Your team has ${vetSeats} vet${vetSeats === 1 ? "" : "s"}, pending invitations included.`,
    option: (name: string, price: string) =>
      `${name} · ${price} excl. VAT per month`,
    optionDetail: (maxVets: number, stive: string) =>
      `${maxVets === 1 ? "1 vet" : `Up to ${maxVets} vets`}. ${stive}.`,
    legend: "Plan",
    submit: "Change plan",
  },
  invoices: {
    title: "Invoices",
    description:
      "Amounts excl. VAT, with VAT at 20%. Invoices are simulated during this phase.",
    descriptionLive: "Amounts excl. VAT, with VAT at 20%.",
    period: (start: string, end: string) => `from ${start} to ${end}`,
    status: {
      paid: "Paid",
      processing: "Collection in progress",
      open: "To be collected",
      failed: "Direct debit refused",
    },
    vat: "VAT 20%",
    total: "Total incl. VAT",
    none: "No invoices yet.",
  },
  cancel: {
    title: "Cancel",
    description:
      "Your active follow-ups continue until they end, so that no owner is left without an answer. No new follow-up can be started after the effective date. When the last follow-up ends, the practice keeps read-only access for 3 months.",
    confirm: (date: string) =>
      `I confirm the cancellation, effective on ${date}.`,
    submit: "Cancel the subscription",
  },
  access: {
    graceTitle: (days: number) =>
      `Direct debit refused: ${days} day${days === 1 ? "" : "s"} to settle`,
    graceBody: (date: string) =>
      `After ${date}, new follow-ups will be suspended. Active follow-ups continue in any case.`,
    blockedTitle: "New follow-ups suspended",
    blockedUnpaid:
      "Payment was not settled within 30 days. Your active follow-ups continue until they end.",
    blockedCancelled:
      "The subscription is cancelled. Your active follow-ups continue until they end.",
    readOnlyTitle: (date: string) => `Read-only access until ${date}`,
    readOnlyBody:
      "No follow-ups are active any more. You can view the history; a PDF export is available from support on request.",
    closedTitle: "Practice access ended",
    closedBody:
      "The read-only period has ended. Contact support for any export request.",
  },
  settle: "Retry the direct debit (simulated)",
  settleLive: "Retry the direct debit",
  notices: {
    confirmRequired: "Tick the confirmation box to continue.",
    planChanged: "Plan changed. It applies from the next billing date.",
    annualCommitted:
      "Annual commitment recorded. The annual rate applies from the next billing date.",
    stayMonthly: "Noted: you stay on monthly billing, with no commitment.",
    cancelled: (date: string) =>
      `Cancellation recorded. It takes effect on ${date}; your active follow-ups continue until they end.`,
    settled:
      "Direct debit successful (simulated). Thank you, everything is in order.",
    settleProcessing:
      'Direct debit sent. Your bank confirms it within a few business days; the invoice stays "in progress" until then.',
    settleFailed:
      "The direct debit failed again. Check the mandate or contact support.",
  },
};
