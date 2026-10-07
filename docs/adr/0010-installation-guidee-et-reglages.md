# 0010 — Installation guidée et réglages de Numa, des urgences et de la garde

- Statut : accepté (7 octobre 2026)

## Contexte

Cahier des charges §7 et §16 : installation autonome en huit étapes (cabinet, WhatsApp Business, dr.veto, horaires et urgences, équipe, protocoles, mandat de prélèvement, suivi test), pensée pour cinq à quinze minutes grâce à des réglages de départ. Consignes d'urgence distinctes pour la journée, la nuit, le week-end et les jours fériés ; planning de garde ; escalade aux autres vétérinaires après un délai réglable entre trois et cinq heures ; analyse de photo désactivée par défaut. ADR 0004 : aucun connecteur réel en phase 1.

## Décision

1. **Réglages en base, par cabinet, sous RLS forcée** (migration 0005) : `organization_settings` (délai d'escalade borné 180–300 min, analyse photo à `false` par défaut, fuseau Europe/Paris), `availability_windows` (une plage d'envoi par jour), `emergency_instructions` (une consigne par période, 10 à 1 500 caractères), `emergency_contacts` (6 au plus, format de numéro vérifié), `on_call_schedules`, `integration_connections`, `onboarding_steps`. Les bornes sont vérifiées par Zod et par des contraintes `CHECK`.
2. **Garde** : seul un vétérinaire actif peut être de garde (déclencheur en base) ; une garde dure au plus 14 jours ; le service refuse les chevauchements sous verrou du cabinet. Une garde passée n'est plus supprimable : elle reste dans l'historique.
3. **Connexions simulées uniquement** : `integration_connections.mode` n'accepte que `simulated`. Les adaptateurs `src/adapters/{whatsapp,drveto,payments}/fake.ts` ne contactent rien et ne renvoient qu'un libellé masqué (deux derniers chiffres du numéro, deux premiers caractères du code). Le numéro, le code complet et toute donnée bancaire ne sont jamais conservés ni journalisés. L'interface affiche « Simulé » partout.
4. **Progression calculée, pas déclarée** : chaque étape est déduite des données (connexion présente, règles complètes, protocole du cabinet validé, suivi test existant). Seule l'étape « équipe » se déclare terminée, car travailler sans équipe est un choix légitime. La garde n'est pas exigée pour terminer l'étape des règles : un cabinet sans garde envoie ses alertes au vétérinaire responsable.
5. **Réglages de départ** : envois du lundi au samedi de 8 h à 20 h et consignes d'urgence génériques, sans aucun conseil médical, que le cabinet relit et adapte. Les appliquer deux fois ne duplique rien.
6. **Suivi test** : `followups.is_test`. Il exige un protocole du cabinet validé, un vétérinaire ayant le droit de lancer des suivis, crée un animal et un propriétaire fictifs en brouillon, et porte le badge « Suivi test » dans la liste et le dossier. Il n'envoie rien ; la facturation (lot 8) l'exclura du décompte.
7. **Droits** : tout passe par `organization.settings` (vétérinaire administrateur par défaut) ; sans elle, les deux écrans répondent 404 et disparaissent de la navigation.
8. **Audit** : réglages appliqués, horaires, consignes (période seulement), contacts (sans numéro), alertes, gardes, connexions (fournisseur et mention `simulated`), étapes et suivi test.

## Conséquences

- Les protocoles de départ restent ajoutés un par un depuis l'écran Protocoles (lot 6), où le vétérinaire les relit avant de les valider.
- Le moteur d'envoi et d'escalade (phase suivante) lira ces réglages ; les remplacer par de vrais connecteurs exigera un ADR, des comptes et des secrets décidés par Aaron.
