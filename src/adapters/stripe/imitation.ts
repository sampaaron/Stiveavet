import { randomBytes } from "node:crypto";

import { STRIPE_API_VERSION } from "./api";
import { stripeSignatureHeader } from "./signature";

/**
 * Imitation locale de l'API Stripe (lot 24), pour les tests seulement : aucun appel réseau,
 * aucun compte. Elle vérifie la clé, la version et l'idempotence comme Stripe, garde chaque
 * prélèvement pour que les tests comptent ce qui a été demandé, et fabrique les événements
 * signés que Stripe enverrait (mandat signé, prélèvement réussi ou refusé, contestation).
 */

const token = (prefix: string) =>
  `${prefix}_${randomBytes(12).toString("hex")}`;

export type ImitatedIntent = {
  id: string;
  amount: number;
  customer: string;
  paymentMethod: string;
  mandate: string;
  metadata: Record<string, string>;
  idempotencyKey: string | null;
  status: "processing" | "succeeded" | "requires_payment_method";
};

type Outage = { status: number; code?: string };

function fieldsOf(body: URLSearchParams) {
  const flat: Record<string, string> = {};
  const nested: Record<string, Record<string, string>> = {};
  for (const [key, value] of body) {
    const match = /^([a-z_]+)\[([a-z_0-9]+)\]$/.exec(key);
    if (match?.[1] && match[2]) (nested[match[1]] ??= {})[match[2]] = value;
    else flat[key] = value;
  }
  return { flat, nested };
}

export function stripeImitation(options: {
  secretKey: string;
  webhookSecret: string;
}) {
  const customers = new Map<string, Record<string, string>>();
  const sessions = new Map<
    string,
    { customer: string; successUrl: string; cancelUrl: string; locale: string }
  >();
  const intents: ImitatedIntent[] = [];
  const detached: string[] = [];
  const replies = new Map<string, { body: string; status: number }>();
  const outages: Outage[] = [];
  let declineNext = false;

  const json = (status: number, body: unknown) =>
    Response.json(body, { status });

  function create(
    path: string,
    flat: Record<string, string>,
    nested: Record<string, Record<string, string>>,
  ): Response {
    if (path === "customers") {
      const id = token("cus");
      customers.set(id, nested.metadata ?? {});
      return json(200, { id, object: "customer" });
    }
    if (path === "checkout/sessions") {
      const customer = flat.customer ?? "";
      if (
        flat.mode !== "setup" ||
        !customers.has(customer) ||
        nested.payment_method_types?.["0"] !== "sepa_debit"
      )
        return json(400, { error: { type: "invalid_request_error" } });
      const id = token("cs_test");
      sessions.set(id, {
        customer,
        successUrl: flat.success_url ?? "",
        cancelUrl: flat.cancel_url ?? "",
        locale: flat.locale ?? "auto",
      });
      return json(200, {
        id,
        url: `https://checkout.stripe.com/c/pay/${id}`,
      });
    }
    if (path === "payment_intents") {
      if (flat.confirm !== "true" || flat.off_session !== "true")
        return json(400, { error: { type: "invalid_request_error" } });
      const intent: ImitatedIntent = {
        id: token("pi"),
        amount: Number(flat.amount),
        customer: flat.customer ?? "",
        paymentMethod: flat.payment_method ?? "",
        mandate: flat.mandate ?? "",
        metadata: nested.metadata ?? {},
        idempotencyKey: null,
        status: declineNext ? "requires_payment_method" : "processing",
      };
      intents.push(intent);
      if (declineNext) {
        declineNext = false;
        return json(402, {
          error: {
            type: "card_error",
            code: "payment_intent_payment_attempt_failed",
            payment_intent: { id: intent.id, status: intent.status },
          },
        });
      }
      return json(200, { id: intent.id, status: intent.status });
    }
    const detach = /^payment_methods\/(pm_[A-Za-z0-9]+)\/detach$/.exec(path);
    if (detach?.[1]) {
      if (detached.includes(detach[1]))
        return json(400, { error: { type: "invalid_request_error" } });
      detached.push(detach[1]);
      return json(200, { id: detach[1], customer: null });
    }
    return json(404, { error: { type: "invalid_request_error" } });
  }

  async function handle(url: URL, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    if (headers.get("authorization") !== `Bearer ${options.secretKey}`)
      return json(401, { error: { type: "authentication_error" } });
    if (headers.get("stripe-version") !== STRIPE_API_VERSION)
      return json(400, { error: { type: "invalid_request_error" } });
    if (init.method !== "POST" || !(init.body instanceof URLSearchParams))
      return json(400, { error: { type: "invalid_request_error" } });
    const outage = outages.shift();
    if (outage)
      return json(outage.status, {
        error: { type: "api_error", code: outage.code },
      });
    const path = url.pathname.replace(/^\/v1\//, "");
    const key = headers.get("idempotency-key");
    const signature = `${path}?${init.body.toString()}`;
    if (key) {
      const known = replies.get(key);
      if (known) {
        // Même clé, autre requête : refusé par Stripe.
        if (known.body !== signature)
          return json(400, {
            error: {
              type: "idempotency_error",
              code: "idempotency_key_in_use",
            },
          });
        return json(
          known.status,
          JSON.parse(replies.get(`${key}:reply`)?.body ?? "{}"),
        );
      }
    }
    const { flat, nested } = fieldsOf(init.body);
    const response = create(path, flat, nested);
    if (key) {
      const intent = path === "payment_intents" ? intents.at(-1) : undefined;
      if (intent) intent.idempotencyKey = key;
      replies.set(key, { body: signature, status: response.status });
      replies.set(`${key}:reply`, {
        body: JSON.stringify(await response.clone().json()),
        status: response.status,
      });
    }
    return response;
  }

  /** Événement Stripe signé, prêt à poster sur le webhook. */
  function signed(
    type: string,
    object: Record<string, unknown>,
    at = new Date(),
  ) {
    const event = {
      id: token("evt"),
      object: "event",
      type,
      created: Math.floor(at.getTime() / 1000),
      livemode: false,
      data: { object },
    };
    const body = new TextEncoder().encode(JSON.stringify(event));
    return {
      event,
      body,
      header: stripeSignatureHeader(body, options.webhookSecret, at),
    };
  }

  function intent(id: string): ImitatedIntent {
    const found = intents.find((candidate) => candidate.id === id);
    if (!found) throw new Error("prélèvement inconnu de l'imitation");
    return found;
  }

  return {
    customers,
    sessions,
    intents,
    detached,
    /** `fetch` à passer au connecteur Stripe. */
    fetch: (async (input: string | URL | Request, init: RequestInit = {}) =>
      handle(
        new URL(input instanceof Request ? input.url : input),
        init,
      )) as typeof fetch,
    /** Prochains appels en panne (ex. 503), dans l'ordre. */
    failNext(...next: Outage[]) {
      outages.push(...next);
    },
    /** Prochain prélèvement refusé tout de suite (402). */
    declineNextPayment() {
      declineNext = true;
    },
    /** Le cabinet a saisi son IBAN chez Stripe : mandat signé. */
    mandateSigned(sessionId: string) {
      const session = sessions.get(sessionId);
      if (!session) throw new Error("session inconnue de l'imitation");
      const ids = { paymentMethod: token("pm"), mandate: token("mandate") };
      return {
        ...ids,
        ...signed("setup_intent.succeeded", {
          id: token("seti"),
          object: "setup_intent",
          status: "succeeded",
          customer: session.customer,
          payment_method: ids.paymentMethod,
          mandate: ids.mandate,
          payment_method_types: ["sepa_debit"],
        }),
      };
    },
    /** Issue d'un prélèvement SEPA, quelques jours plus tard. */
    paymentSettled(id: string, outcome: "succeeded" | "failed") {
      const found = intent(id);
      found.status =
        outcome === "succeeded" ? "succeeded" : "requires_payment_method";
      return signed(
        outcome === "succeeded"
          ? "payment_intent.succeeded"
          : "payment_intent.payment_failed",
        {
          id,
          object: "payment_intent",
          status: found.status,
          amount: found.amount,
          customer: found.customer,
          metadata: found.metadata,
        },
      );
    },
    /** Contestation du prélèvement par le titulaire du compte. */
    disputed(id: string) {
      const found = intent(id);
      return signed("charge.dispute.created", {
        id: token("dp"),
        object: "dispute",
        amount: found.amount,
        payment_intent: id,
        reason: "general",
        status: "needs_response",
      });
    },
    /** Mandat révoqué à la banque par le cabinet. */
    mandateRevoked(mandate: string, paymentMethod: string) {
      return signed("mandate.updated", {
        id: mandate,
        object: "mandate",
        status: "inactive",
        payment_method: paymentMethod,
      });
    },
    signed,
  };
}

export type StripeImitation = ReturnType<typeof stripeImitation>;
