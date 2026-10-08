import { z } from "zod";

/**
 * API REST de Stripe (ADR 0027), limitée à ce dont Stivea Vet a besoin : client, page de
 * signature du mandat SEPA, prélèvement d'une facture, retrait du moyen de paiement. Un seul
 * appel à chaque fois, sans nouvelle tentative ici. Aucune clé, aucun IBAN, aucun nom dans
 * les erreurs : seulement leur classe et un code technique.
 */

export const STRIPE_API_URL = "https://api.stripe.com/v1";
/** Version de l'API, figée ; revue à l'ouverture du compte (partie B) et à chaque mise à jour. */
export const STRIPE_API_VERSION = "2025-09-30.clover";

export type StripeFailure = "retry" | "account" | "rejected" | "invalid";

export class StripeError extends Error {
  constructor(
    readonly failure: StripeFailure,
    readonly code: string,
  ) {
    super(`stripe:${failure}:${code}`);
  }
}

export type StripeApiOptions = {
  fetch: typeof fetch;
  secretKey: string;
  baseUrl?: string;
  timeoutMs?: number;
};

/** Issue d'un prélèvement : « processing » pour un SEPA, qui met plusieurs jours. */
export type PaymentStatus = "processing" | "succeeded" | "failed";

const id = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}_[A-Za-z0-9]{6,64}$`));

export const stripeIds = {
  customer: id("cus"),
  paymentMethod: id("pm"),
  mandate: id("mandate"),
  paymentIntent: z.string().regex(/^pi_[A-Za-z0-9]{8,64}$/),
};

const customer = z.object({ id: stripeIds.customer });
const session = z.object({
  id: z.string().regex(/^cs_[A-Za-z0-9_]{6,200}$/),
  url: z.url({ protocol: /^https$/ }),
});
const paymentIntent = z.object({
  id: stripeIds.paymentIntent,
  status: z.string(),
});
const errorBody = z.object({
  error: z.object({
    type: z.string().optional(),
    code: z.string().optional(),
    payment_intent: z.object({ id: stripeIds.paymentIntent }).optional(),
  }),
});

/** Corps « application/x-www-form-urlencoded » de Stripe, objets imbriqués en `a[b]`. */
type FormValue = string | number | boolean | string[] | Record<string, string>;
export function formBody(fields: Record<string, FormValue | undefined>) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (Array.isArray(value))
      value.forEach((item, index) => body.append(`${key}[${index}]`, item));
    else if (typeof value === "object")
      for (const [inner, item] of Object.entries(value))
        body.append(`${key}[${inner}]`, item);
    else body.append(key, String(value));
  }
  return body;
}

function statusOf(status: string): PaymentStatus {
  if (status === "succeeded") return "succeeded";
  if (status === "processing") return "processing";
  return "failed";
}

export function stripeApi(options: StripeApiOptions) {
  const base = (options.baseUrl ?? STRIPE_API_URL).replace(/\/+$/, "");
  const timeoutMs = options.timeoutMs ?? 20_000;

  async function call(
    path: string,
    fields: Record<string, FormValue | undefined>,
    idempotencyKey?: string,
  ): Promise<{ status: number; payload: unknown }> {
    let response: Response;
    try {
      response = await options.fetch(`${base}/${path}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${options.secretKey}`,
          "content-type": "application/x-www-form-urlencoded",
          "stripe-version": STRIPE_API_VERSION,
          ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
        },
        body: formBody(fields),
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new StripeError("retry", "network");
    }
    const payload: unknown = await response.json().catch(() => null);
    return { status: response.status, payload };
  }

  function failure(status: number, payload: unknown): StripeError {
    const code = errorBody.safeParse(payload).data?.error.code;
    const suffix =
      code && /^[a-z_]{2,60}$/.test(code) ? code : `http_${status}`;
    if (status === 401 || status === 403)
      return new StripeError("account", suffix);
    if (status === 429 || status >= 500 || status === 409)
      return new StripeError("retry", suffix);
    return new StripeError("rejected", suffix);
  }

  function read<T>(
    schema: z.ZodType<T>,
    result: { status: number; payload: unknown },
  ) {
    if (result.status < 200 || result.status >= 300)
      throw failure(result.status, result.payload);
    const parsed = schema.safeParse(result.payload);
    if (!parsed.success) throw new StripeError("invalid", "response");
    return parsed.data;
  }

  return {
    /** Client Stripe du cabinet ; une seule création par cabinet, même si l'appel est rejoué. */
    async createCustomer(input: {
      organizationId: string;
      organizationName: string;
    }): Promise<string> {
      return read(
        customer,
        await call(
          "customers",
          {
            name: input.organizationName,
            metadata: { organization_id: input.organizationId },
          },
          `customer:${input.organizationId}`,
        ),
      ).id;
    },

    /** Page Stripe de signature du mandat SEPA : l'IBAN y est saisi, jamais chez Stivea Vet. */
    async createMandateSession(input: {
      customerId: string;
      organizationId: string;
      locale: "fr" | "en";
      successUrl: string;
      cancelUrl: string;
    }): Promise<{ id: string; url: string }> {
      return read(
        session,
        await call("checkout/sessions", {
          mode: "setup",
          customer: input.customerId,
          currency: "eur",
          payment_method_types: ["sepa_debit"],
          locale: input.locale,
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          metadata: { organization_id: input.organizationId },
        }),
      );
    },

    /**
     * Prélèvement d'une facture sur le mandat. La clé d'idempotence rend l'appel sans effet
     * s'il est rejoué : une même tentative ne prélève qu'une fois.
     */
    async collect(input: {
      customerId: string;
      paymentMethodId: string;
      mandateId: string;
      amountCents: number;
      organizationId: string;
      invoiceId: string;
      invoiceNumber: string;
      idempotencyKey: string;
    }): Promise<{ id: string; status: PaymentStatus }> {
      const result = await call(
        "payment_intents",
        {
          amount: input.amountCents,
          currency: "eur",
          customer: input.customerId,
          payment_method: input.paymentMethodId,
          payment_method_types: ["sepa_debit"],
          mandate: input.mandateId,
          confirm: true,
          off_session: true,
          description: `Stivea Vet, facture ${input.invoiceNumber}`,
          metadata: {
            organization_id: input.organizationId,
            invoice_id: input.invoiceId,
          },
        },
        input.idempotencyKey,
      );
      // Refus immédiat (402) : le paiement existe chez Stripe, il est simplement refusé.
      const refused = errorBody.safeParse(result.payload).data?.error
        .payment_intent?.id;
      if (result.status === 402 && refused)
        return { id: refused, status: "failed" };
      const intent = read(paymentIntent, result);
      return { id: intent.id, status: statusOf(intent.status) };
    },

    /** Retrait du moyen de paiement : le mandat ne peut plus servir. */
    async detachPaymentMethod(paymentMethodId: string): Promise<void> {
      const result = await call(
        `payment_methods/${encodeURIComponent(paymentMethodId)}/detach`,
        {},
      );
      // Déjà retiré chez Stripe : rien à faire.
      if (result.status === 400 || result.status === 404) return;
      read(z.object({ id: stripeIds.paymentMethod }), result);
    },
  };
}

export type StripeApi = ReturnType<typeof stripeApi>;
