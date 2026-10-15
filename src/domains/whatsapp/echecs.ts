import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { escapeHtml } from "@/adapters/email/html";
import type { EmailMessage, EmailSender } from "@/adapters/email/types";
import { JobError } from "@/domains/taches/kinds";
import type { JobHandler } from "@/domains/taches/worker";
import { memberships, organizations, users } from "@/server/db/schema";

import { FAILURE_EMAIL_JOB, failedSendsFor } from "./envoi";

/**
 * E-mail au vétérinaire responsable quand des messages WhatsApp n'ont pas pu partir
 * (cahier des charges §15) : au plus un par heure, avec un lien vers chaque suivi concerné.
 * Ni nom, ni contenu, ni numéro : l'e-mail renvoie vers Stivea Vet, où tout se lit.
 */

const payload = z.object({ membershipId: z.uuid() });

const LOOKBACK_MS = 24 * 3_600_000;

function failureEmail(
  to: string,
  details: {
    displayName: string;
    organizationName: string;
    failed: number;
    links: string[];
  },
): EmailMessage {
  const count =
    details.failed > 1
      ? `${details.failed} messages WhatsApp n'ont pas pu être envoyés`
      : "Un message WhatsApp n'a pas pu être envoyé";
  const lines = [
    `Bonjour ${details.displayName},`,
    `${count} à des propriétaires suivis par ${details.organizationName}.`,
    "Ouvrez chaque suivi pour voir le message et le renvoyer, ou contactez le propriétaire directement.",
  ];
  const closing = "L'équipe Stivea Vet";
  return {
    to,
    subject: "Stivea Vet : message WhatsApp non envoyé",
    text: [...lines, details.links.join("\n"), closing].join("\n\n"),
    html: [
      ...lines.map((line) => `<p>${escapeHtml(line)}</p>`),
      `<ul>${details.links
        .map(
          (link) =>
            `<li><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></li>`,
        )
        .join("")}</ul>`,
      `<p>${escapeHtml(closing)}</p>`,
    ].join(""),
  };
}

export function failureEmailHandlers(deps: {
  email: EmailSender;
  appUrl: string;
  clock?: () => Date;
}): Record<string, JobHandler> {
  const { email, appUrl, clock = () => new Date() } = deps;
  return {
    [FAILURE_EMAIL_JOB]: async ({ tx, job }) => {
      const parsed = payload.safeParse(job.payload);
      if (!parsed.success) throw new JobError("invalid_payload");
      const [recipient] = await tx
        .select({
          email: users.email,
          displayName: users.displayName,
          organizationName: organizations.name,
        })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .innerJoin(
          organizations,
          eq(organizations.id, memberships.organizationId),
        )
        .where(
          and(
            eq(memberships.id, parsed.data.membershipId),
            isNull(memberships.deactivatedAt),
            isNull(users.disabledAt),
          ),
        );
      if (!recipient) return;
      const failed = await failedSendsFor(
        tx,
        parsed.data.membershipId,
        new Date(clock().getTime() - LOOKBACK_MS),
      );
      // Renvoyés avec succès entre-temps : plus rien à signaler.
      if (failed.length === 0) return;
      const links = [...new Set(failed.map((row) => row.followupId))].map(
        (id) => new URL(`/app/suivis/${id}`, appUrl).toString(),
      );
      try {
        await email.send(
          failureEmail(recipient.email, {
            displayName: recipient.displayName,
            organizationName: recipient.organizationName,
            failed: failed.length,
            links,
          }),
        );
      } catch {
        throw new JobError("provider_unavailable");
      }
    },
  };
}
