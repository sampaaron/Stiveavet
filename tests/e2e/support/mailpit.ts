import { expect } from "@playwright/test";

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";

type Summary = { ID: string; Subject: string; Created: string };

/** Dernier e-mail reçu par `to` après `since` (Mailpit capture tout, rien ne sort). */
export async function latestEmail(to: string, since: Date) {
  let found: Summary | undefined;
  await expect
    .poll(
      async () => {
        const response = await fetch(
          `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
        );
        const body = (await response.json()) as { messages: Summary[] };
        found = body.messages.find(
          (message) => new Date(message.Created) >= since,
        );
        return Boolean(found);
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  const message = (await (
    await fetch(`${MAILPIT}/api/v1/message/${found?.ID}`)
  ).json()) as { Subject: string; Text: string };
  return message;
}

export async function securityCode(to: string, since: Date) {
  const { Subject } = await latestEmail(to, since);
  const code = /\b(\d{6})\b/.exec(Subject)?.[1];
  if (!code) throw new Error("Code introuvable dans l'e-mail");
  return code;
}
