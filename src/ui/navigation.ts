import {
  Activity,
  BellRing,
  BookOpen,
  CircleAlert,
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

import type { AppDictionary } from "@/i18n/app/types";

type NavLabel = keyof AppDictionary["shell"]["nav"];

export type NavItem = {
  href: string;
  /** Clé du libellé dans le dictionnaire (`shell.nav`), traduite à l'affichage. */
  label: NavLabel;
  icon: LucideIcon;
  /** Visible si la personne a au moins une de ces permissions (aucune : visible de tous). */
  anyOf?: readonly string[];
};
export type NavSection = { label?: NavLabel; items: NavItem[] };

/**
 * Navigation de l'espace cabinet. Une entrée n'apparaît que si la personne a le droit
 * d'ouvrir l'écran ; le serveur refuse de toute façon l'accès (404) sans la permission.
 */
export const appNavigation: NavSection[] = [
  {
    items: [
      { href: "/app", label: "today", icon: Sun },
      {
        href: "/app/suivis",
        label: "followups",
        icon: MessagesSquare,
        anyOf: [
          "followups.read_all",
          "followups.read_own",
          "followups.read_summary",
        ],
      },
      {
        href: "/app/alertes",
        label: "alerts",
        icon: BellRing,
        anyOf: ["clinical.read"],
      },
      {
        href: "/app/agenda",
        label: "agenda",
        icon: CalendarDays,
        anyOf: ["agenda.read"],
      },
      {
        href: "/app/stive",
        label: "stive",
        icon: Sparkles,
        anyOf: ["stive.use"],
      },
    ],
  },
  {
    label: "practice",
    items: [
      {
        href: "/app/protocoles",
        label: "protocols",
        icon: ClipboardList,
        anyOf: ["protocols.manage", "protocols.create_own", "followups.launch"],
      },
      {
        href: "/app/reglages",
        label: "settings",
        icon: Settings2,
        anyOf: ["organization.settings"],
      },
      {
        href: "/app/equipe",
        label: "team",
        icon: Users,
        anyOf: ["team.manage"],
      },
      {
        href: "/app/facturation",
        label: "billing",
        icon: CreditCard,
        anyOf: ["billing.manage"],
      },
      {
        href: "/app/taches",
        label: "tasks",
        icon: CircleAlert,
        anyOf: ["organization.settings"],
      },
      {
        href: "/app/journal",
        label: "journal",
        icon: Activity,
        anyOf: ["activity_log.read"],
      },
    ],
  },
  {
    items: [
      { href: "/app/aide", label: "help", icon: LifeBuoy },
      {
        href: "/app/demarrage",
        label: "onboarding",
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
