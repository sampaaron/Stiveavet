import {
  Activity,
  BellRing,
  BookOpen,
  Bot,
  Building2,
  CalendarDays,
  ClipboardList,
  CreditCard,
  FileText,
  House,
  LayoutDashboard,
  LifeBuoy,
  MessagesSquare,
  PawPrint,
  PlugZap,
  Settings2,
  Sparkles,
  Users,
  Workflow,
  Zap,
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
  /** Portrait de l'assistant IA affiché à la place de l'icône. */
  assistant?: "numa" | "stive";
  /** Pastille du nombre d'alertes sans accusé de réception. */
  badge?: "alerts";
};

/** Entrée du menu : une rubrique et ses onglets, affichés en tête de page (ADR 0044). */
export type NavSection = {
  label: NavLabel;
  icon: LucideIcon;
  tabs: NavItem[];
  /** La rubrique n'existe que si son premier onglet est permis (sinon son nom tromperait). */
  anchored?: boolean;
};

/** Lecture des suivis, sous l'une de ses trois formes. */
const READ_FOLLOWUPS = [
  "followups.read_all",
  "followups.read_own",
  "followups.read_summary",
] as const;

/** Stive : son usage, ou la présentation de l'offre pour qui gère l'abonnement. */
const STIVE = ["stive.use", "billing.manage"] as const;

/**
 * Navigation de l'espace cabinet : quatre rubriques, chacune avec ses onglets. Un onglet
 * n'apparaît que si la personne a le droit d'ouvrir l'écran ; le serveur refuse de toute
 * façon l'accès (404) sans la permission.
 */
export const appNavigation: NavSection[] = [
  {
    label: "home",
    icon: House,
    tabs: [
      { href: "/app", label: "overview", icon: LayoutDashboard },
      {
        href: "/app/stive",
        label: "stive",
        icon: Sparkles,
        anyOf: STIVE,
        assistant: "stive",
      },
      { href: "/app/assistants", label: "assistants", icon: Bot },
      { href: "/app/raccourcis", label: "shortcuts", icon: Zap, anyOf: STIVE },
    ],
  },
  {
    label: "followupSection",
    icon: MessagesSquare,
    tabs: [
      {
        href: "/app/suivis",
        label: "followups",
        icon: MessagesSquare,
        anyOf: READ_FOLLOWUPS,
      },
      {
        href: "/app/animaux",
        label: "patients",
        icon: PawPrint,
        anyOf: ["followups.launch"],
      },
      {
        href: "/app/alertes",
        label: "alerts",
        icon: BellRing,
        anyOf: ["clinical.read"],
        badge: "alerts",
      },
      {
        href: "/app/agenda",
        label: "agenda",
        icon: CalendarDays,
        anyOf: ["agenda.read"],
      },
    ],
  },
  {
    label: "protocols",
    icon: ClipboardList,
    anchored: true,
    tabs: [
      {
        href: "/app/protocoles",
        label: "protocols",
        icon: ClipboardList,
        anyOf: ["protocols.manage", "protocols.create_own", "followups.launch"],
      },
      {
        href: "/app/contenus",
        label: "contents",
        icon: FileText,
        anyOf: ["stive.use"],
      },
    ],
  },
  {
    label: "practice",
    icon: Building2,
    tabs: [
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
        href: "/app/reglages",
        label: "settings",
        icon: Settings2,
        anyOf: ["organization.settings"],
      },
      {
        href: "/app/integrations",
        label: "integrations",
        icon: PlugZap,
        anyOf: ["organization.settings"],
      },
      {
        href: "/app/taches",
        label: "tasks",
        icon: Workflow,
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
];

/** Bas du menu, sous les rubriques. */
export const footerNavigation: NavItem[] = [
  {
    href: "/app/demarrage",
    label: "onboarding",
    icon: BookOpen,
    anyOf: ["organization.settings"],
  },
  { href: "/app/aide", label: "help", icon: LifeBuoy },
];

function allowed(item: NavItem, permissions: ReadonlySet<string>): boolean {
  return !item.anyOf || item.anyOf.some((key) => permissions.has(key));
}

/** Rubriques et onglets visibles avec ces permissions ; une rubrique vide disparaît. */
export function visibleNavigation(
  permissions: ReadonlySet<string>,
): NavSection[] {
  return appNavigation
    .filter(
      (section) =>
        !section.anchored ||
        (section.tabs[0] !== undefined &&
          allowed(section.tabs[0], permissions)),
    )
    .map((section) => ({
      ...section,
      tabs: section.tabs.filter((tab) => allowed(tab, permissions)),
    }))
    .filter((section) => section.tabs.length > 0);
}

export function visibleFooter(permissions: ReadonlySet<string>): NavItem[] {
  return footerNavigation.filter((item) => allowed(item, permissions));
}

/** Un onglet est actif sur sa page et ses sous-pages ; « Vue d'ensemble » seulement sur /app. */
export function isNavItemActive(href: string, pathname: string): boolean {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Rubrique de la page ouverte, parmi celles visibles ; aucune pour le compte ou l'aide. */
export function currentSection(
  sections: readonly NavSection[],
  pathname: string,
): NavSection | undefined {
  return sections.find((section) =>
    section.tabs.some((tab) => isNavItemActive(tab.href, pathname)),
  );
}
