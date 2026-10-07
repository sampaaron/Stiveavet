import type { MemberRole } from "@/domains/auth/repository";
import { followupAccess } from "@/domains/suivis/policies";
import type { FollowupAccess } from "@/domains/suivis/policies";

import {
  PERMISSIONS,
  PERMISSION_KEYS,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
} from "./permissions";
import type { PermissionKey } from "./permissions";

/**
 * Matrice des permissions, générée depuis le code (source unique) vers
 * docs/securite/permissions.md. Un test échoue si le document n'est plus à jour.
 */

const ROLES: MemberRole[] = ["admin_vet", "vet", "assistant"];

type Situation = {
  label: string;
  responsible: boolean;
  shared: boolean;
  isPrivate: boolean;
};

export const FOLLOWUP_SITUATIONS: Situation[] = [
  {
    label: "Responsable du suivi",
    responsible: true,
    shared: false,
    isPrivate: false,
  },
  {
    label: "Responsable, dossier privé",
    responsible: true,
    shared: false,
    isPrivate: true,
  },
  {
    label: "Suivi d'un confrère",
    responsible: false,
    shared: false,
    isPrivate: false,
  },
  {
    label: "Suivi d'un confrère, partagé avec moi",
    responsible: false,
    shared: true,
    isPrivate: false,
  },
  {
    label: "Dossier privé d'un confrère",
    responsible: false,
    shared: false,
    isPrivate: true,
  },
  {
    label: "Dossier privé d'un confrère, partagé avec moi",
    responsible: false,
    shared: true,
    isPrivate: true,
  },
];

const ACCESS_LABEL: Record<FollowupAccess | "not_applicable", string> = {
  not_applicable: "sans objet",
  none: "invisible (404)",
  summary: "organisation seulement",
  clinical: "complet",
};

export function defaultAccess(
  role: MemberRole,
  situation: Situation,
): FollowupAccess | "not_applicable" {
  // Un assistant n'est jamais responsable ni destinataire d'un partage.
  if (role === "assistant" && (situation.responsible || situation.shared))
    return "not_applicable";
  const me = "moi";
  return followupAccess(
    { membershipId: me, permissions: new Set(ROLE_PERMISSIONS[role].defaults) },
    {
      responsibleMembershipId: situation.responsible ? me : "confrere",
      isPrivate: situation.isPrivate,
      sharedWith: situation.shared ? [me] : [],
    },
  );
}

function cell(role: MemberRole, permission: PermissionKey): string {
  const grants = ROLE_PERMISSIONS[role];
  if (grants.defaults.includes(permission)) return "oui";
  if (grants.optional.includes(permission)) return "sur décision";
  return "non";
}

export function permissionsMarkdown(): string {
  const header = `| Permission | ${ROLES.map((role) => ROLE_LABELS[role]).join(" | ")} |`;
  const separator = `| --- | ${ROLES.map(() => "---").join(" | ")} |`;
  const rows = PERMISSION_KEYS.map(
    (key) =>
      `| ${PERMISSIONS[key]} (\`${key}\`) | ${ROLES.map((role) => cell(role, key)).join(" | ")} |`,
  );
  const accessHeader = `| Situation | ${ROLES.map((role) => ROLE_LABELS[role]).join(" | ")} |`;
  const accessRows = FOLLOWUP_SITUATIONS.filter(
    (situation) => !(situation.responsible && situation.shared),
  ).map(
    (situation) =>
      `| ${situation.label} | ${ROLES.map((role) => ACCESS_LABEL[defaultAccess(role, situation)]).join(" | ")} |`,
  );

  return [
    "# Matrice des permissions",
    "",
    "<!-- Généré par `pnpm docs:permissions` depuis src/domains/equipe. Ne pas modifier à la main. -->",
    "",
    "Les droits sont des permissions précises, attribuées à chaque membre. « oui » : donnée par défaut au rôle ; « sur décision » : l'administrateur peut l'ouvrir ; « non » : impossible pour ce rôle (refusé par la base).",
    "",
    header,
    separator,
    ...rows,
    "",
    "## Accès à un dossier (droits par défaut)",
    "",
    "Ordre de contrôle : personne authentifiée → membre actif du cabinet → permission → responsable ou partage explicite → dossier privé → journal d'audit. Un dossier invisible répond 404, comme un dossier inexistant ou d'un autre cabinet.",
    "",
    accessHeader,
    separator.replace("Permission", "Situation"),
    ...accessRows,
    "",
    "« organisation seulement » : animal, propriétaire, statut, responsable, rendez-vous de contrôle. « complet » : en plus, intervention, priorité, conversation, photos, vocaux et synthèses. Un assistant à qui l'administrateur ouvre `clinical.read` passe à « complet » sur les dossiers qu'il voit.",
    "",
  ].join("\n");
}
