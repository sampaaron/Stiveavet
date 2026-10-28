"use client";

import { CircleCheck, RefreshCw, Smartphone } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import type { OptInContact } from "@/domains/suivis/accord-qr";
import { useAppText, useLocale } from "@/i18n/app/client";
import { AlertBanner } from "@/ui/alert-banner";
import { Button, ButtonLink } from "@/ui/button";
import { Card } from "@/ui/card";
import { formatTime } from "@/ui/format";

import {
  issueOptInQrAction,
  optInStatusAction,
  simulateOptInAction,
} from "./actions";
import type { OptInQr } from "./actions";

const POLL_MS = 3_000;

/**
 * Un QR code par propriétaire encore sans accord (ADR 0051). Les codes sont demandés une fois
 * à l'ouverture, puis l'accord est relu toutes les trois secondes jusqu'à ce que chacun l'ait
 * envoyé ; un code échu se remplace d'un clic.
 */
export function OptInBoard({
  followupId,
  contacts,
  simulated,
}: {
  followupId: string;
  contacts: OptInContact[];
  simulated: boolean;
}) {
  const text = useAppText().followups.optInQr;
  const locale = useLocale();
  const [codes, setCodes] = useState<Record<string, OptInQr>>({});
  const [optedIn, setOptedIn] = useState(
    () =>
      new Set(
        contacts.filter((contact) => contact.optedIn).map((item) => item.id),
      ),
  );
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [pending, startTransition] = useTransition();
  const requested = useRef(false);
  const done = contacts.every((contact) => optedIn.has(contact.id));

  const issue = useCallback(() => {
    startTransition(async () => {
      const result = await issueOptInQrAction(followupId);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setError(null);
      setCodes(
        Object.fromEntries(result.codes.map((item) => [item.contactId, item])),
      );
      setNow(Date.now());
    });
  }, [followupId]);

  useEffect(() => {
    // Une seule demande à l'ouverture : chaque demande remplace les codes précédents.
    if (requested.current || done) return;
    requested.current = true;
    issue();
  }, [issue, done]);

  useEffect(() => {
    if (done) return;
    const timer = window.setInterval(() => {
      setNow(Date.now());
      // Une relecture manquée (réseau) est refaite au tour suivant.
      optInStatusAction(followupId).then(
        (result) => {
          if ("optedIn" in result) setOptedIn(new Set(result.optedIn));
        },
        () => undefined,
      );
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [done, followupId]);

  function simulate(code: OptInQr) {
    startTransition(async () => {
      const result = await simulateOptInAction(followupId, code.code);
      if ("error" in result) setError(result.error);
      else if (!result.accepted) setError(text.notReceived);
      else {
        setError(null);
        setOptedIn((current) => new Set(current).add(code.contactId));
      }
    });
  }

  return (
    <div className="grid gap-6">
      {simulated && !done ? (
        <AlertBanner tone="info" title={text.simulatedTitle}>
          {text.simulatedBody}
        </AlertBanner>
      ) : null}
      {error ? <AlertBanner tone="watch" title={error} /> : null}
      {done ? (
        <AlertBanner
          tone="success"
          title={text.allReceived(contacts.length)}
          action={
            <div className="flex flex-wrap gap-2">
              <ButtonLink
                href={`/app/suivis/${followupId}/lancement`}
                size="sm"
              >
                {text.toSheet}
              </ButtonLink>
              <ButtonLink
                href="/app#prets-a-lancer"
                variant="secondary"
                size="sm"
              >
                {text.toDashboard}
              </ButtonLink>
            </div>
          }
        />
      ) : null}

      <ul className="grid gap-6 md:grid-cols-2">
        {contacts.map((contact) => {
          const code = codes[contact.id];
          const received = optedIn.has(contact.id);
          const expired = code
            ? new Date(code.expiresAt).getTime() <= now
            : false;
          return (
            <li key={contact.id}>
              <Card className="flex h-full flex-col items-center gap-4 p-6 text-center">
                <div>
                  <p className="text-sm font-medium text-ink-muted">
                    {text.roles[contact.role]}
                  </p>
                  <h2 className="text-lg font-bold tracking-tight">
                    {contact.name}
                  </h2>
                  <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-ink-muted">
                    <Smartphone aria-hidden="true" className="size-4" />
                    {text.fromPhone(contact.phone)}
                  </p>
                </div>

                {received ? (
                  <p
                    role="status"
                    className="flex flex-1 flex-col items-center justify-center gap-2 font-semibold text-brand-ink"
                  >
                    <CircleCheck aria-hidden="true" className="size-12" />
                    {text.received}
                  </p>
                ) : code && !expired ? (
                  <>
                    <div className="rounded-[var(--radius-card)] border border-line bg-white p-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={code.qr}
                        alt={text.qrAlt(contact.name)}
                        width={224}
                        height={224}
                        className="size-56"
                      />
                    </div>
                    <div className="grid gap-1 text-sm">
                      <p className="font-mono font-semibold tracking-wider">
                        {text.code(code.code)}
                      </p>
                      <p className="text-ink-muted">
                        {text.validUntil(
                          formatTime(new Date(code.expiresAt), locale),
                        )}
                      </p>
                      <p
                        role="status"
                        className="mt-1 inline-flex items-center justify-center gap-2 font-medium text-ink-muted"
                      >
                        <span
                          aria-hidden="true"
                          className="size-2 animate-pulse rounded-full bg-brand motion-reduce:animate-none"
                        />
                        {text.waiting}
                      </p>
                    </div>
                    {simulated ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={pending}
                        aria-busy={pending}
                        onClick={() => simulate(code)}
                      >
                        {text.simulate}
                        <span className="sr-only">
                          {text.simulateFor(contact.name)}
                        </span>
                      </Button>
                    ) : null}
                  </>
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-ink-muted">
                    <p>{expired ? text.expired : text.preparing}</p>
                    {expired ? (
                      <Button
                        size="sm"
                        disabled={pending}
                        aria-busy={pending}
                        onClick={issue}
                        icon={
                          <RefreshCw aria-hidden="true" className="size-4" />
                        }
                      >
                        {text.renew}
                      </Button>
                    ) : null}
                  </div>
                )}
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
