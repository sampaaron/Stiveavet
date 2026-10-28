import "server-only";

import type { ConversationView } from "@/domains/conversations/service";
import { fillTemplate } from "@/domains/reponses/remplissage";
import { draftMessage } from "@/domains/stive/brouillons";
import type { DraftTemplate } from "@/domains/stive/demandes";
import type { AppDictionary } from "@/i18n/app/types";
import { memberProfile } from "@/server/auth/profile";
import type { MemberContext } from "@/server/authz";
import { services } from "@/server/services";

import type { ReadyReply } from "./conversation-controls";

const STIVE_DRAFTS: readonly DraftTemplate[] = ["news", "photo", "call"];

/**
 * Réponses prêtes du dossier (ADR 0048) : les modèles du cabinet dans la langue du
 * propriétaire, puis les phrases d'organisation de Stive (sans contenu médical), remplies pour
 * ce dossier. Rien n'est envoyé : la personne relit, corrige et envoie elle-même.
 */
export async function readyReplies(
  t: AppDictionary,
  context: MemberContext,
  view: ConversationView,
): Promise<ReadyReply[]> {
  const can = (key: Parameters<typeof context.permissions.has>[0]) =>
    context.permissions.has(key);
  if (!can("owner_messages.reply") || !view.recipients?.length) return [];
  const language =
    view.contacts.find((contact) => contact.role === "primary")?.language ??
    "fr";
  const profile = await memberProfile(context);
  const values = {
    animal: view.animalName,
    proprietaire: t.common.list(view.recipients),
    veterinaire: profile.displayName,
    cabinet: profile.organizationName,
  };
  const templates = await services.replyTemplates().list(context);
  const cabinet = templates
    .filter((template) => template.language === language)
    .map((template) => ({
      key: `modele-${template.id}`,
      label: template.title,
      text: fillTemplate(template.body, values),
      source: "cabinet" as const,
    }));
  const stive = can("stive.use")
    ? STIVE_DRAFTS.map((template) => ({
        key: `stive-${template}`,
        label: t.dossier.conversation.composer.ready.stive[template],
        text: draftMessage(template, {
          language,
          recipients: view.recipients ?? [],
          vetName: profile.displayName,
          practiceName: profile.organizationName,
          animalName: view.animalName,
        }),
        source: "stive" as const,
      }))
    : [];
  return [...cabinet, ...stive];
}
