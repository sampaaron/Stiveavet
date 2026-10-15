import { z } from "zod";

import { signRequest } from "@/adapters/scaleway/sigv4";
import type { Credentials } from "@/adapters/scaleway/sigv4";

/**
 * Scaleway Queues, région Paris, par son API compatible SQS (protocole JSON, ADR 0028).
 * La file ne transporte qu'un signal de réveil du worker, jamais le contenu d'une tâche :
 * PostgreSQL reste la seule source de vérité des tâches (ADR 0014).
 */

export const SCALEWAY_QUEUES_URL = "https://sqs.mnq.fr-par.scaleway.com";

export class QueueError extends Error {
  constructor(readonly status: number) {
    super(`queue:${status}`);
  }
}

const received = z.object({
  Messages: z
    .array(z.object({ ReceiptHandle: z.string().min(1).max(2048) }))
    .optional(),
});

export type QueueClient = {
  send(body: string): Promise<void>;
  /** Attend jusqu'à `waitSeconds` (20 au plus) ; renvoie les reçus des messages lus. */
  receive(waitSeconds: number): Promise<string[]>;
  remove(receipts: string[]): Promise<void>;
};

export function scalewayQueue(options: {
  fetch: typeof fetch;
  queueUrl: string;
  credentials: Credentials;
  endpoint?: string;
}): QueueClient {
  const url = new URL(options.endpoint ?? SCALEWAY_QUEUES_URL);

  async function call(action: string, payload: object): Promise<unknown> {
    const body = JSON.stringify({ QueueUrl: options.queueUrl, ...payload });
    const headers = signRequest({
      url,
      headers: {
        "content-type": "application/x-amz-json-1.0",
        "x-amz-target": `AmazonSQS.${action}`,
      },
      body,
      credentials: options.credentials,
      region: "fr-par",
      service: "sqs",
    });
    let response: Response;
    try {
      response = await options.fetch(url, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new QueueError(0);
    }
    if (!response.ok) throw new QueueError(response.status);
    return response.json().catch(() => ({}));
  }

  return {
    async send(body) {
      await call("SendMessage", { MessageBody: body });
    },
    async receive(waitSeconds) {
      const result = received.safeParse(
        await call("ReceiveMessage", {
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: Math.min(Math.max(waitSeconds, 0), 20),
        }),
      );
      return (result.data?.Messages ?? []).map(
        (message) => message.ReceiptHandle,
      );
    },
    async remove(receipts) {
      if (!receipts.length) return;
      await call("DeleteMessageBatch", {
        Entries: receipts.map((ReceiptHandle, index) => ({
          Id: String(index),
          ReceiptHandle,
        })),
      });
    },
  };
}
