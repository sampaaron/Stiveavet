import type { Actor } from "@/domains/equipe/actor";
import type { FollowupShareView } from "@/domains/suivis/service";
import { appText } from "@/i18n/app/server";
import { services } from "@/server/services";
import { SectionCard } from "@/ui/card";
import { formatDate } from "@/ui/format";

import { PrivacyForm, RevokeShareForm, ShareForm } from "./access-forms";

/** Réservé au vétérinaire responsable : partages et confidentialité de son dossier. */
export async function AccessPanel({
  context,
  followupId,
  isPrivate,
  shares,
}: {
  context: Actor;
  followupId: string;
  isPrivate: boolean;
  shares: FollowupShareView[];
}) {
  const [candidates, { t, locale }] = await Promise.all([
    services.followups().shareCandidates(context, followupId),
    appText(),
  ]);
  const text = t.dossier.access;
  return (
    <SectionCard
      title={text.title}
      description={
        isPrivate ? text.privateDescription : text.publicDescription
      }
    >
      <div className="grid gap-5">
        <PrivacyForm followupId={followupId} isPrivate={isPrivate} />
        <div>
          <h3 className="mb-2 text-sm font-semibold">{text.sharedWith}</h3>
          {shares.length > 0 ? (
            <ul className="grid gap-2">
              {shares.map((share) => (
                <li
                  key={share.membershipId}
                  className="flex items-start justify-between gap-3 text-sm"
                >
                  <span>
                    <span className="block font-semibold">{share.name}</span>
                    <span className="block text-ink-muted">
                      {share.expiresAt
                        ? text.until(formatDate(share.expiresAt, locale))
                        : text.untilRevoked}
                    </span>
                  </span>
                  <RevokeShareForm
                    followupId={followupId}
                    membershipId={share.membershipId}
                    name={share.name}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-muted">{text.noShares}</p>
          )}
        </div>
        {candidates.length > 0 ? (
          <ShareForm followupId={followupId} candidates={candidates} />
        ) : (
          <p className="text-sm text-ink-muted">{text.noCandidates}</p>
        )}
      </div>
    </SectionCard>
  );
}
