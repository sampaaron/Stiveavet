import type { Actor } from "@/domains/equipe/actor";
import type { FollowupShareView } from "@/domains/suivis/service";
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
  const candidates = await services
    .followups()
    .shareCandidates(context, followupId);
  return (
    <SectionCard
      title="Accès au dossier"
      description={
        isPrivate
          ? "Dossier privé : visible seulement par vous et les confrères avec qui vous le partagez."
          : "Visible par les personnes du cabinet autorisées à voir tous les suivis."
      }
    >
      <div className="grid gap-5">
        <PrivacyForm followupId={followupId} isPrivate={isPrivate} />
        <div>
          <h3 className="mb-2 text-sm font-semibold">Partagé avec</h3>
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
                        ? `Jusqu'au ${formatDate(share.expiresAt)}`
                        : "Jusqu'à retrait"}
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
            <p className="text-sm text-ink-muted">Aucun partage.</p>
          )}
        </div>
        {candidates.length > 0 ? (
          <ShareForm followupId={followupId} candidates={candidates} />
        ) : (
          <p className="text-sm text-ink-muted">
            Aucun autre vétérinaire actif à qui partager ce dossier.
          </p>
        )}
      </div>
    </SectionCard>
  );
}
