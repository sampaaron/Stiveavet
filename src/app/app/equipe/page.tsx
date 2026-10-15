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
      <div aria-hidden="true" className="-mt-4 mb-8 flex items-center">
        {members
          .filter((member) => member.active)
          .slice(0, 8)
          .map((member, index) => (
            <span
              key={member.membershipId}
              className="-ml-2.5 grid size-11 place-items-center rounded-full font-display text-sm font-semibold text-white shadow-[0_6px_14px_-8px_rgb(11_18_32/0.6)] ring-[3px] ring-canvas first:ml-0"
              style={{ background: monogramGradient(index) }}
            >
              {initials(member.name)}
            </span>
          ))}
      </div>
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
          <h2
            id="membres"
            className="font-display text-xl font-semibold tracking-tight"
          >
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

/** Monogramme d'un membre : ses initiales, sans titre (« Dr »). */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((part) => /^\p{L}/u.test(part))
    .slice(-2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

/** Dégradés des monogrammes, en rotation (décor seulement). */
const MONOGRAMS = [
  "linear-gradient(135deg,#0f766e,#14b8a6)",
  "linear-gradient(135deg,#087a54,#4ade80)",
  "linear-gradient(135deg,#5b4fe0,#8b7cf6)",
  "linear-gradient(135deg,#0b7480,#38bdf8)",
  "linear-gradient(135deg,#8a5f12,#e0a43a)",
];

function monogramGradient(seed: number): string {
  return MONOGRAMS[seed % MONOGRAMS.length] ?? "var(--color-brand)";
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
    <Card className="p-5 transition-shadow hover:shadow-[0_18px_36px_-24px_var(--section-accent)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-4">
          <span
            aria-hidden="true"
            className={`grid size-12 shrink-0 place-items-center rounded-2xl font-display text-base font-semibold text-white ${member.active ? "" : "opacity-40 grayscale"}`}
            style={{ background: monogramGradient(member.name.length) }}
          >
            {initials(member.name)}
          </span>
          <div className="min-w-0">
            <h3 className="font-display text-lg font-semibold tracking-tight">
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
