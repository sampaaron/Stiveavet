import { CalendarPlus, MessageSquareText, PawPrint } from "lucide-react";
import type { Metadata } from "next";

import { AlertBanner } from "@/ui/alert-banner";
import { AppShell } from "@/ui/app-shell";
import { AssistantCard } from "@/ui/assistant-card";
import { Button, ButtonLink } from "@/ui/button";
import { SectionCard, StatCard } from "@/ui/card";
import { PageHeader } from "@/ui/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/ui/states";
import { StatusBadge } from "@/ui/status-badge";
import type { Status } from "@/ui/status-badge";

import { ConfirmDemo } from "./confirm-demo";

export const metadata: Metadata = { title: "Design system" };

const statuses: Status[] = [
  "normal",
  "watch",
  "urgent",
  "paused",
  "consent-pending",
  "consent-given",
  "consent-stopped",
];

/** Catalogue des composants, avec des données fictives. Page interne, absente en production. */
export default function DesignSystemPage() {
  return (
    <AppShell
      organizationName="Clinique vétérinaire des Tilleuls"
      user={{
        name: "Dr Claire Fontaine",
        roleLabel: "Vétérinaire administratrice",
      }}
    >
      <PageHeader
        title="Design system"
        description="Composants de base de Stivea Vet, affichés avec des données fictives."
        actions={
          <>
            <Button
              variant="secondary"
              icon={<MessageSquareText aria-hidden="true" className="size-4" />}
            >
              Écrire au propriétaire
            </Button>
            <Button icon={<PawPrint aria-hidden="true" className="size-4" />}>
              Lancer un suivi
            </Button>
          </>
        }
      />

      <div className="grid gap-6">
        <AlertBanner
          tone="urgent"
          title="Caramel : saignement signalé sur la plaie"
          action={
            <ButtonLink href="#" size="sm">
              Ouvrir le dossier
            </ButtonLink>
          }
        >
          Message reçu à 21 h 12. Les consignes d&apos;urgence du cabinet ont
          été envoyées au propriétaire.
        </AlertBanner>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Urgences"
            value={1}
            tone="urgent"
            hint="À traiter maintenant"
          />
          <StatCard
            label="À surveiller"
            value={3}
            tone="watch"
            hint="Dont 1 depuis hier"
          />
          <StatCard
            label="Suivis actifs"
            value="7 / 10"
            tone="brand"
            hint="3 places incluses restantes"
          />
          <StatCard label="Rendez-vous Stivea" value={2} hint="Aujourd'hui" />
        </div>

        <SectionCard
          title="Statuts"
          description="Toujours un libellé et une icône, jamais la couleur seule."
        >
          <div className="flex flex-wrap gap-2">
            {statuses.map((status) => (
              <StatusBadge key={status} status={status} />
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Boutons"
          description="Au plus deux actions fortes par zone."
        >
          <div className="flex flex-wrap gap-3">
            <Button>Lancer le suivi</Button>
            <Button variant="secondary">Mettre en pause</Button>
            <Button
              variant="quiet"
              icon={<CalendarPlus aria-hidden="true" className="size-4" />}
            >
              Proposer un rendez-vous
            </Button>
            <Button disabled>Indisponible</Button>
            <Button size="sm">Petit bouton</Button>
          </div>
        </SectionCard>

        <SectionCard title="Bandeaux">
          <div className="grid gap-3">
            <AlertBanner
              tone="success"
              title="Accord donné par le propriétaire"
            />
            <AlertBanner tone="watch" title="Moka mange moins depuis hier">
              À surveiller selon le protocole « Stérilisation chatte ».
            </AlertBanner>
            <AlertBanner tone="info" title="Numa ne pose jamais de diagnostic">
              Elle recueille les informations, applique les signes d&apos;alerte
              validés par le vétérinaire et escalade en cas de doute.
            </AlertBanner>
          </div>
        </SectionCard>

        <div className="grid gap-4 md:grid-cols-2">
          <AssistantCard assistant="numa">
            Suit 7 animaux pour le cabinet. Dernier échange il y a 12 minutes.
          </AssistantCard>
          <AssistantCard assistant="stive">
            Prépare votre point du jour. Toute action réelle attend votre
            confirmation.
          </AssistantCard>
        </div>

        <SectionCard
          title="Confirmation"
          description="Toute action ayant un effet réel demande une confirmation explicite."
        >
          <ConfirmDemo />
        </SectionCard>

        <div className="grid gap-4 md:grid-cols-3">
          <SectionCard title="Vide" headingLevel={3}>
            <EmptyState
              title="Aucun suivi à surveiller"
              description="Les nouveaux signaux apparaîtront ici."
            />
          </SectionCard>
          <SectionCard title="Chargement" headingLevel={3}>
            <LoadingState />
          </SectionCard>
          <SectionCard title="Erreur" headingLevel={3}>
            <ErrorState
              title="Agenda indisponible"
              description="La connexion à dr.veto ne répond pas. Vos suivis continuent normalement."
              action={
                <Button variant="secondary" size="sm">
                  Réessayer
                </Button>
              }
            />
          </SectionCard>
        </div>
      </div>
    </AppShell>
  );
}
