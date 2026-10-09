import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { wakeChannel } from "./config";
import { signRequest } from "@/adapters/scaleway/sigv4";

describe("signature AWS v4", () => {
  it("reproduit le vecteur de test officiel (POST x-www-form-urlencoded)", () => {
    const headers = signRequest({
      url: new URL("https://example.amazonaws.com/"),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "Param1=value1",
      credentials: {
        accessKeyId: "AKIDEXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
      },
      region: "us-east-1",
      service: "service",
      now: new Date("2015-08-30T12:36:00Z"),
    });
    expect(headers.authorization).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=content-type;host;x-amz-date, Signature=ff11897932ad3f4e8b18135d722051e5ac45fc38421b1da7b9d196a0fe09473a",
    );
  });
});

const scaleway = {
  QUEUE_PROVIDER: "scaleway",
  SCW_QUEUE_URL: "https://sqs.mnq.fr-par.scaleway.com/project-essai/reveil",
  SCW_QUEUE_ACCESS_KEY: randomBytes(10).toString("hex"),
  SCW_QUEUE_SECRET_KEY: randomBytes(20).toString("hex"),
};

/** Imitation minimale de la file : garde les signaux déposés, les rend puis les efface. */
function imitation() {
  const queued: string[] = [];
  const calls: string[] = [];
  const fetcher = (async (_url: URL, init: RequestInit) => {
    const headers = init.headers as Record<string, string>;
    const action = headers["x-amz-target"] ?? "";
    calls.push(action);
    if (!headers.authorization?.startsWith("AWS4-HMAC-SHA256 Credential="))
      return new Response("{}", { status: 403 });
    const body = JSON.parse(String(init.body)) as { MessageBody?: string };
    if (action === "AmazonSQS.SendMessage") queued.push(body.MessageBody ?? "");
    if (action === "AmazonSQS.ReceiveMessage")
      return Response.json({
        Messages: queued.splice(0).map((_, index) => ({
          ReceiptHandle: `recu-${index}`,
        })),
      });
    return Response.json({});
  }) as unknown as typeof fetch;
  return { queued, calls, fetcher };
}

describe("réveil du worker par Scaleway Queues", () => {
  it("sans file, rien n'est envoyé et le worker attend l'intervalle fixe", async () => {
    const channel = wakeChannel({});
    await channel.notify();
    const started = Date.now();
    await channel.wait(20);
    expect(Date.now() - started).toBeGreaterThanOrEqual(15);
  });

  it("un signal sans donnée, signé, lu puis effacé par le worker", async () => {
    const queue = imitation();
    const channel = wakeChannel(scaleway, queue.fetcher);
    await channel.notify();
    expect(queue.queued).toEqual(["wake"]);
    await channel.wait(5_000);
    expect(queue.calls).toEqual([
      "AmazonSQS.SendMessage",
      "AmazonSQS.ReceiveMessage",
      "AmazonSQS.DeleteMessageBatch",
    ]);
  });

  it("file injoignable : le worker retombe sur l'attente fixe", async () => {
    const channel = wakeChannel(scaleway, (async () => {
      throw new Error("réseau");
    }) as typeof fetch);
    await expect(channel.wait(10)).resolves.toBeUndefined();
    await expect(channel.notify()).rejects.toThrow("queue:0");
  });

  it("configuration incomplète : seuls les noms des variables sont cités", () => {
    expect(() =>
      wakeChannel({ ...scaleway, SCW_QUEUE_SECRET_KEY: undefined }),
    ).toThrow("SCW_QUEUE_SECRET_KEY");
  });
});
