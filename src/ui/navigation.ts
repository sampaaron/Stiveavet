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

export type NavItem = { href: string; label: string; icon: LucideIcon };
export type NavSection = { label?: string; items: NavItem[] };

/**
 * Navigation de l'espace cabinet. Le filtrage selon les permissions de l'utilisateur
 * arrive avec le lot 5 ; aucune entrée ne doit révéler un écran non autorisé.
 */
export const appNavigation: NavSection[] = [
  {
    items: [
      { href: "/app", label: "Aujourd'hui", icon: Sun },
      { href: "/app/suivis", label: "Suivis", icon: MessagesSquare },
      { href: "/app/agenda", label: "Agenda", icon: CalendarDays },
      { href: "/app/stive", label: "Stive", icon: Sparkles },
    ],
  },
  {
    label: "Cabinet",
    items: [
      { href: "/app/protocoles", label: "Protocoles", icon: ClipboardList },
      {
        href: "/app/reglages",
        label: "Numa, urgences et garde",
        icon: Settings2,
      },
      { href: "/app/equipe", label: "Équipe et droits", icon: Users },
      { href: "/app/facturation", label: "Facturation", icon: CreditCard },
      { href: "/app/journal", label: "Journal d'activité", icon: Activity },
    ],
  },
  {
    items: [
      { href: "/app/aide", label: "Centre d'aide", icon: LifeBuoy },
      { href: "/app/demarrage", label: "Démarrage guidé", icon: BookOpen },
    ],
  },
];

/** Une entrée est active sur sa page et ses sous-pages ; « Aujourd'hui » seulement sur /app. */
export function isNavItemActive(href: string, pathname: string): boolean {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}
