/**
 * Demandes d'approbation des modèles WhatsApp (ADR 0024), à soumettre à Meta depuis le
 * gestionnaire WhatsApp ou son API : `pnpm whatsapp:modeles > modeles.json`. Aucun appel réseau.
 */
import {
  TEMPLATE_CATALOG_VERSION,
  templateSubmissions,
} from "../src/domains/whatsapp/modeles";

process.stdout.write(
  `${JSON.stringify({ version: TEMPLATE_CATALOG_VERSION, templates: templateSubmissions() }, null, 2)}\n`,
);
