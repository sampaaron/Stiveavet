import { and, count, eq, inArray, ne } from "drizzle-orm";

import { auditOrganization, systemAuthor } from "@/domains/audit/journal";
import { invoices, paymentEvents, subscriptions } from "@/server/db/schema";
import type { TenantTransaction } from "@/server/db/tenant";

/**
 * Issue d'un prélèvement (ADR 0011, 0027), partagée par le prélèvement simulé, immédiat, et
 * par les événements de Stripe, qui arrivent quelques jours plus tard. Chaque issue n'est
 * écrite qu'une fois : le journal des paiements refuse le doublon (référence et nature).
 */

export type PaymentOutcome = "succeeded" | "failed" | "disputed";

/** L'impayé reste ouvert tant qu'une facture est refusée. */
export async function refreshUnpaid(tx: TenantTransaction, now: Date) {
  const [failed] = await tx
    .select({ n: count() })
    .from(invoices)
    .where(eq(invoices.status, "failed"));
  const [row] = await tx
    .select({ unpaidSince: subscriptions.unpaidSince })
    .from(subscriptions);
  if (!row) return;
  const unpaid = (failed?.n ?? 0) > 0;
  if (unpaid && !row.unpaidSince)
    await tx.update(subscriptions).set({ unpaidSince: now });
  if (!unpaid && row.unpaidSince)
    await tx.update(subscriptions).set({ unpaidSince: null });
}

/** Écrit une ligne du journal des paiements ; faux si elle y était déjà. */
export async function recordPayment(
  tx: TenantTransaction,
  organizationId: string,
  input: {
    invoiceId: string;
    kind: PaymentOutcome | "submitted";
    providerRef: string;
    amountCents: number;
    now: Date;
  },
): Promise<boolean> {
  const inserted = await tx
    .insert(paymentEvents)
    .values({
      organizationId,
      invoiceId: input.invoiceId,
      kind: input.kind,
      providerRef: input.providerRef,
      amountCents: input.amountCents,
      occurredAt: input.now,
    })
    .onConflictDoNothing()
    .returning({ id: paymentEvents.id });
  return inserted.length > 0;
}

const AUDIT: Record<PaymentOutcome, string> = {
  succeeded: "invoice.paid",
  failed: "invoice.payment_failed",
  disputed: "invoice.payment_reversed",
};

/**
 * Applique l'issue d'un prélèvement : payée, refusée (ouvre les 30 jours de régularisation),
 * ou contestée après paiement (repasse en refusée). Sans effet si elle est déjà connue.
 */
export async function settleInvoice(
  tx: TenantTransaction,
  organizationId: string,
  input: {
    invoiceId: string;
    outcome: PaymentOutcome;
    providerRef: string;
    amountCents: number;
    now: Date;
    simulated: boolean;
  },
): Promise<void> {
  if (
    !(await recordPayment(tx, organizationId, {
      ...input,
      kind: input.outcome,
    }))
  )
    return;
  const invoice = eq(invoices.id, input.invoiceId);
  if (input.outcome === "succeeded")
    await tx
      .update(invoices)
      .set({ status: "paid", paidAt: input.now })
      .where(and(invoice, ne(invoices.status, "paid")));
  else
    await tx
      .update(invoices)
      .set({ status: "failed", paidAt: null })
      .where(
        input.outcome === "disputed"
          ? invoice
          : and(
              invoice,
              inArray(invoices.status, ["open", "processing", "failed"]),
            ),
      );
  await refreshUnpaid(tx, input.now);
  await auditOrganization(
    tx,
    systemAuthor(organizationId),
    AUDIT[input.outcome],
    {
      invoiceId: input.invoiceId,
      simulated: input.simulated,
    },
  );
}
