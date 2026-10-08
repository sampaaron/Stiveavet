import { appText } from "@/i18n/app/server";
import { ButtonLink } from "@/ui/button";
import { Card } from "@/ui/card";
import { EmptyState } from "@/ui/states";

export default async function CabinetNotFound() {
  const { t } = await appText();
  const text = t.dashboard.notFound;
  return (
    <Card>
      <EmptyState
        title={text.title}
        description={text.description}
        action={<ButtonLink href="/app">{text.back}</ButtonLink>}
      />
    </Card>
  );
}
