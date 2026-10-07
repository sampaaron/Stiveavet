import { ButtonLink } from "@/ui/button";
import { Card } from "@/ui/card";
import { EmptyState } from "@/ui/states";

export default function CabinetNotFound() {
  return (
    <Card>
      <EmptyState
        title="Cet écran n'est pas encore disponible"
        description="Il arrive dans un prochain lot de la phase 1. Les données affichées dans Stivea restent fictives."
        action={<ButtonLink href="/app">Revenir à Aujourd&apos;hui</ButtonLink>}
      />
    </Card>
  );
}
