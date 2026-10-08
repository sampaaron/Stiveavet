import type { Metadata } from "next";

import type { TeamMember } from "@/domains/equipe/service";
import { ROLE_PERMISSIONS, VET_ROLES } from "@/domains/equipe/permissions";
import { appText } from "@/i18n/app/server";
import type { AppDictionary } from "@/i18n/app/types";
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

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await appText();
  return { title: t.team.title };
}

type Option = { value: string; label: string };

function roleOptions(t: AppDictionary): Option[] {
  return (["admin_vet", "vet", "assistant"] as const).map((role) => ({
    value: role,
    label: t.labels.roles[role],
  }));
}

export default async function TeamPage() {
  const context = await requirePermission("team.manage");
  const { t, locale } = await appText();
  const roles = roleOptions(t);
  const team = services.team();
  const [members, invitations, limit] = await Promise.all([
    team.members(context),
    team.pendingInvitations(context),
    team.vetLimit(context),
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
        title={t.team.title}
        description={t.team.description(activeVets.length + pendingVets, limit)}
      />
      <div className="grid gap-6">
        <SectionCard
          title={t.team.invite.title}
          description={t.team.invite.description}
        >
          <InviteForm roles={roles} />
        </SectionCard>

        {invitations.length > 0 ? (
          <SectionCard title={t.team.pending.title}>
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
                      {invitation.email} · {t.labels.roles[invitation.role]} ·{" "}
                      {t.team.pending.until(
                        formatDate(invitation.expiresAt, locale),
                      )}
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
            {t.team.members.title}
          </h2>
          {members.map((member) => (
            <MemberCard
              key={member.membershipId}
              member={member}
              t={t}
              roles={roles}
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
  t,
  roles,
  reassignTargets,
}: {
  member: TeamMember;
  t: AppDictionary;
  roles: Option[];
  reassignTargets: Option[];
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
              <span className="font-normal text-ink-muted">
                {" "}
                · {t.team.members.you}
              </span>
            ) : null}
          </h3>
          <p className="text-sm text-ink-muted">
            {member.email} · {t.labels.roles[member.role]}
          </p>
        </div>
        <p className="text-sm text-ink-muted">
          {member.active
            ? t.team.members.activeFollowups(member.activeFollowups)
            : t.team.members.accessRemoved}
        </p>
      </div>

      {editable ? (
        <div className="mt-5 grid gap-6 border-t border-line pt-5 lg:grid-cols-2">
          {member.role === "admin_vet" ? (
            <p className="text-sm text-ink-muted">
              {t.team.members.adminHasAll}
            </p>
          ) : (
            <PermissionsForm
              membershipId={member.membershipId}
              memberName={member.name}
              granted={member.permissions}
              options={[...grants.defaults, ...grants.optional].map((key) => ({
                value: key,
                label: t.labels.permissions[key],
                fixed: grants.defaults.includes(key),
              }))}
            />
          )}
          <div className="grid content-start gap-6">
            <RoleForm
              membershipId={member.membershipId}
              memberName={member.name}
              role={member.role}
              roles={roles}
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
