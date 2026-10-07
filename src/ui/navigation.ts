import {
  Activity,
  BookOpen,
  CalendarDays,
  ClipboardList,
  CreditCard,
  LifeBuoy,
  MessagesSquare,
  Settings2,
  Sparkles,
  Sun,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Visible si la personne a au moins une de ces permissions (aucune : visible de tous). */
  anyOf?: readonly string[];
};
export type NavSection = { label?: string; items: NavItem[] };

/**
 * Navigation de l'espace cabinet. Une entrée n'apparaît que si la personne a le droit
 * d'ouvrir l'écran ; le serveur refuse de toute façon l'accès (404) sans la permission.
 */
export const appNavigation: NavSection[] = [
  {
    items: [
      { href: "/app", label: "Aujourd'hui", icon: Sun },
      {
        href: "/app/suivis",
        label: "Suivis",
        icon: MessagesSquare,
        anyOf: [
          "followups.read_all",
          "followups.read_own",
          "followups.read_summary",
        ],
      },
      {
        href: "/app/agenda",
        label: "Agenda",
        icon: CalendarDays,
        anyOf: ["agenda.read"],
      },
      {
        href: "/app/stive",
        label: "Stive",
        icon: Sparkles,
        anyOf: ["stive.use"],
      },
    ],
  },
  {
    label: "Cabinet",
    items: [
      {
        href: "/app/protocoles",
        label: "Protocoles",
        icon: ClipboardList,
        anyOf: ["protocols.manage", "protocols.create_own", "followups.launch"],
      },
      {
        href: "/app/reglages",
        label: "Numa, urgences et garde",
        icon: Settings2,
        anyOf: ["organization.settings"],
      },
      {
        href: "/app/equipe",
        label: "Équipe et droits",
        icon: Users,
        anyOf: ["team.manage"],
      },
      {
        href: "/app/facturation",
        label: "Facturation",
        icon: CreditCard,
        anyOf: ["billing.manage"],
      },
      {
        href: "/app/journal",
        label: "Journal d'activité",
        icon: Activity,
        anyOf: ["activity_log.read"],
      },
    ],
  },
  {
    items: [
      { href: "/app/aide", label: "Centre d'aide", icon: LifeBuoy },
      {
        href: "/app/demarrage",
        label: "Démarrage guidé",
        icon: BookOpen,
        anyOf: ["organization.settings"],
      },
    ],
  },
];

/** Sections et entrées visibles avec ces permissions ; une section vide disparaît. */
export function visibleNavigation(
  permissions: ReadonlySet<string>,
): NavSection[] {
  return appNavigation
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => !item.anyOf || item.anyOf.some((key) => permissions.has(key)),
      ),
    }))
    .filter((section) => section.items.length > 0);
}

/** Une entrée est active sur sa page et ses sous-pages ; « Aujourd'hui » seulement sur /app. */
export function isNavItemActive(href: string, pathname: string): boolean {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}
