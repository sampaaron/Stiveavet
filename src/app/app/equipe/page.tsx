import type { Metadata } from "next";

import type { TeamMember } from "@/domains/equipe/service";
import {
  MAX_VETS_PER_ORGANIZATION,
  PERMISSIONS,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  VET_ROLES,
} from "@/domains/equipe/permissions";
import { requirePermission } from "@/server/authz";
import { services } from "@/server/services";
import { Card, SectionCard } from "@/ui/card";
import { formatDate } from "@/ui/format";
import { PageHeader } from "@/ui/page-header";

import {
  DeactivateForm,
  InviteForm,
  PermissionsForm,
  ReactivateForm,
  RevokeInvitationForm,
  RoleForm,
} from "./team-forms";

export const metadata: Metadata = { title: "Équipe et droits" };

const ROLE_OPTIONS = (["admin_vet", "vet", "assistant"] as const).map(
  (role) => ({ value: role, label: ROLE_LABELS[role] }),
);

export default async function TeamPage() {
  const context = await requirePermission("team.manage");
  const team = services.team();
  const [members, invitations] = await Promise.all([
    team.members(context),
    team.pendingInvitations(context),
  ]);
  const activeVets = members.filter(
    (member) => member.active && VET_ROLES.has(member.role),
  );
  const pendingVets = invitations.filter((invitation) =>
    VET_ROLES.has(invitation.role),
  ).length;

  return (
    <>
      <PageHeader
        title="Équipe et droits"
        description={`${activeVets.length + pendingVets} vétérinaire(s) sur ${MAX_VETS_PER_ORGANIZATION}, invitations en attente comprises. Les assistants ne sont pas limités.`}
      />
      <div className="grid gap-6">
        <SectionCard
          title="Inviter un membre"
          description="La personne reçoit un lien par e-mail, valable 7 jours et utilisable une seule fois."
        >
          <InviteForm roles={ROLE_OPTIONS} />
        </SectionCard>

        {invitations.length > 0 ? (
          <SectionCard title="Invitations en attente">
            <ul className="grid gap-3">
              {invitations.map((invitation) => (
                <li
                  key={invitation.id}
                  className="flex flex-wrap items-start justify-between gap-3 text-sm"
                >
                  <span>
                    <span className="block font-semibold">
                      {invitation.displayName}
                    </span>
                    <span className="block text-ink-muted">
                      {invitation.email} · {ROLE_LABELS[invitation.role]} ·
                      jusqu&apos;au {formatDate(invitation.expiresAt)}
                    </span>
                  </span>
                  <RevokeInvitationForm
                    id={invitation.id}
                    email={invitation.email}
                  />
                </li>
              ))}
            </ul>
          </SectionCard>
        ) : null}

        <section aria-labelledby="membres" className="grid gap-4">
          <h2 id="membres" className="text-lg font-bold tracking-tight">
            Membres
          </h2>
          {members.map((member) => (
            <MemberCard
              key={member.membershipId}
              member={member}
              reassignTargets={activeVets
                .filter((vet) => vet.membershipId !== member.membershipId)
                .map((vet) => ({ value: vet.membershipId, label: vet.name }))}
            />
          ))}
        </section>
      </div>
    </>
  );
}

function MemberCard({
  member,
  reassignTargets,
}: {
  member: TeamMember;
  reassignTargets: { value: string; label: string }[];
}) {
  const grants = ROLE_PERMISSIONS[member.role];
  const editable = !member.isSelf && member.active;
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-bold">
            {member.name}
            {member.isSelf ? (
              <span className="font-normal text-ink-muted"> · vous</span>
            ) : null}
          </h3>
          <p className="text-sm text-ink-muted">
            {member.email} · {ROLE_LABELS[member.role]}
          </p>
        </div>
        <p className="text-sm text-ink-muted">
          {member.active
            ? `${member.activeFollowups} suivi(s) en cours`
            : "Accès retiré"}
        </p>
      </div>

      {editable ? (
        <div className="mt-5 grid gap-6 border-t border-line pt-5 lg:grid-cols-2">
          {member.role === "admin_vet" ? (
            <p className="text-sm text-ink-muted">
              Un vétérinaire administrateur a tous les droits. Changez son rôle
              pour les restreindre.
            </p>
          ) : (
            <PermissionsForm
              membershipId={member.membershipId}
              memberName={member.name}
              granted={member.permissions}
              options={[...grants.defaults, ...grants.optional].map((key) => ({
                value: key,
                label: PERMISSIONS[key],
                fixed: grants.defaults.includes(key),
              }))}
            />
          )}
          <div className="grid content-start gap-6">
            <RoleForm
              membershipId={member.membershipId}
              memberName={member.name}
              role={member.role}
              roles={ROLE_OPTIONS}
            />
            <DeactivateForm
              membershipId={member.membershipId}
              memberName={member.name}
              activeFollowups={member.activeFollowups}
              targets={reassignTargets}
            />
          </div>
        </div>
      ) : null}
      {!member.active ? (
        <div className="mt-5 border-t border-line pt-5">
          <ReactivateForm
            membershipId={member.membershipId}
            memberName={member.name}
          />
        </div>
      ) : null}
    </Card>
  );
}
