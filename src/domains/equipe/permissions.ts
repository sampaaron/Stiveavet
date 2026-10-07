import type { MemberRole } from "@/domains/auth/repository";

/**
 * Catalogue des permissions (miroir de la table `permissions`, migration 0003) et droits
 * autorisés par rôle (miroir de `role_permissions`). Un test d'intégration vérifie que les
 * deux concordent exactement ; la base fait foi et refuse toute permission non autorisée.
 */
export const PERMISSIONS = {
  "organization.settings": "Modifier les réglages du cabinet",
  "team.manage": "Gérer l'équipe et les droits",
  "protocols.manage": "Créer et modifier les protocoles",
  "protocols.create_own": "Créer et modifier ses propres protocoles",
  "billing.manage": "Gérer l'abonnement et la facturation",
  "activity_log.read": "Consulter le journal d'activité",
  "followups.read_all":
    "Voir tous les suivis du cabinet (hors dossiers privés)",
  "followups.read_own": "Voir ses suivis et ceux partagés avec soi",
  "followups.read_summary":
    "Voir la liste organisationnelle des suivis, sans données cliniques",
  "followups.launch":
    "Préparer et lancer un suivi (lancement réservé aux vétérinaires)",
  "followups.share": "Partager ses suivis avec un confrère",
  "clinical.read": "Lire conversations, photos, vocaux et synthèses cliniques",
  "owner_messages.reply": "Répondre aux propriétaires",
  "appointments.confirm": "Confirmer manuellement un rendez-vous",
  "agenda.read": "Consulter l'agenda",
  "agenda.capture": "Envoyer une capture d'agenda (créneaux libres)",
  "stive.use": "Utiliser Stive, l'assistant IA interne",
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[];

export function isPermissionKey(value: string): value is PermissionKey {
  return Object.hasOwn(PERMISSIONS, value);
}

type RoleGrants = { defaults: PermissionKey[]; optional: PermissionKey[] };

export const ROLE_PERMISSIONS: Record<MemberRole, RoleGrants> = {
  admin_vet: { defaults: PERMISSION_KEYS, optional: [] },
  vet: {
    defaults: [
      "followups.read_own",
      "followups.launch",
      "protocols.create_own",
      "followups.share",
      "clinical.read",
      "owner_messages.reply",
      "appointments.confirm",
      "agenda.read",
      "agenda.capture",
      "stive.use",
    ],
    optional: ["followups.read_all", "protocols.manage"],
  },
  assistant: {
    defaults: ["followups.read_summary", "agenda.read"],
    optional: [
      "appointments.confirm",
      "agenda.capture",
      "owner_messages.reply",
      "clinical.read",
      "followups.launch",
      "stive.use",
    ],
  },
};

export const ROLE_LABELS: Record<MemberRole, string> = {
  admin_vet: "Vétérinaire administrateur",
  vet: "Vétérinaire",
  assistant: "Assistant vétérinaire",
};

/** Rôles comptés dans la limite de 3 vétérinaires par cabinet (cahier des charges §1). */
export const VET_ROLES: ReadonlySet<MemberRole> = new Set(["admin_vet", "vet"]);
export const MAX_VETS_PER_ORGANIZATION = 3;
