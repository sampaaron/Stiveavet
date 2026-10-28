# 0034 — Stive, l'assistant IA de l'équipe

- Statut : accepté (18 octobre 2026), plan validé par Aaron (`plan/PLAN_STIVE.md`, « ok »)

## Contexte

Lot 29. Stive est vendu en Pro et Premium (cahier des charges §10), mais n'avait pas d'écran. Le cahier impose :

- une limite d'usage par personne, jamais présentée comme illimitée ;
- un Stive propre à chaque personne (§11) ;
- aucune décision médicale ;
- une mention IA toujours visible ;
- aucune action réelle sans confirmation humaine.

Aaron a choisi de rester en simulation : Stive doit fonctionner sans compte, et la vraie IA doit pouvoir s'y brancher plus tard.

## Décision

1. **Six demandes, reconnues par des règles écrites** (`demandes.ts`) : point du jour, résumé d'un dossier, créneaux libres, rendez-vous demandés, brouillon de message, pause/reprise/arrêt d'un suivi.
   - Tout le reste reçoit « je ne sais pas encore faire ça », jamais une réponse inventée.
   - La vraie IA ne remplacera que cette étape : elle choisira parmi ces six outils, et le serveur les exécutera avec les droits de la personne.
2. **Aucun accès propre.** Stive lit par les services des écrans : tableau de bord, synthèse, agenda, demandes de rendez-vous, conversations. Il hérite donc :
   - de l'isolation par cabinet (RLS) ;
   - des rôles ;
   - de l'accès clinique ou d'organisation par dossier ;
   - des dossiers privés.

   Sans accès clinique, une assistante ne reçoit que l'organisation (agenda, fiches à finir). Une consultation de dossier par Stive est tracée comme à l'écran (`followup.viewed`, `via: "stive"`).

3. **Cartes « À confirmer ».**
   - Une réponse qui mène à un effet réel enregistre une proposition (`stive_proposals`). Le clic appelle l'action existante, avec sa propre vérification de droits : `appointments.confirm`/`decline` ou `launch.changeStatus`.
   - Stive n'a aucun chemin d'écriture sur les suivis ou l'agenda. Le journal garde la ligne habituelle de l'action, plus `stive.action_confirmed`, affichée comme « action préparée par Stive ».
   - Une proposition dépassée (statut déjà changé, rendez-vous déjà traité) passe « expirée ».
4. **Brouillons sans envoi.**
   - Le brouillon reste dans la proposition. Le lien « Ouvrir dans le dossier » le pose dans la zone de saisie.
   - Seul le clic sur Envoyer l'envoie, par le chemin normal : consentement, mode test et garde-fous de Numa.
   - Les modèles sont non médicaux, en français ou en anglais selon le propriétaire, et passent la relecture `checkNumaReply`.
5. **Réponses gardées en données**, validées par Zod (`reponses.ts`) à l'écriture comme à la lecture, et mises en mots à l'affichage dans la langue de la personne. Chaque élément de dossier garde l'identifiant du suivi. À chaque lecture, l'historique est filtré par les accès du moment : un dossier rendu privé disparaît de l'historique de qui n'y a plus accès.
6. **Échanges privés et conservés 30 jours.**
   - La politique RLS `own_stive` réserve les messages et les propositions à leur auteur (`app.is_current_member`). L'administrateur ne les lit pas, ni une tâche de fond.
   - Le balayage de conservation appelle `app.purge_stive_messages()` (SECURITY DEFINER, cabinet courant seulement), qui efface les échanges de plus de 30 jours ; les propositions partent en cascade.
   - « Effacer mes échanges » est journalisé, sans contenu.
   - Les questions ne vont jamais dans le journal ni dans les logs.
7. **Limite mensuelle par personne**, définie dans `facturation/rules.ts` : Starter 0, Pro 200, Premium 600.
   - Le compteur (`stive_usage`, mois de Paris) est incrémenté de façon atomique, seulement sous la limite, et ne peut que monter.
   - À la limite, Stive propose l'offre supérieure s'il y en a une. Les cartes déjà ouvertes restent utilisables.
8. **Starter** : `stive.use` est retiré par l'offre. L'administrateur voit la présentation de Stive et le lien vers la facturation, sans essai ni donnée ; les autres membres n'ont pas l'écran.

## Conséquences

- Tests unitaires : reconnaissance des demandes (FR/EN, « résumé » distinct de « resume »), modèles de brouillon, limites des offres.
- Tests d'intégration sur une vraie base :
  - lecture selon les droits ;
  - dossier privé masqué puis rendu ;
  - aucune action avant le clic, et droits revérifiés au clic ;
  - brouillon sans envoi ;
  - Starter ;
  - limite atteinte ;
  - échanges invisibles pour l'administrateur ;
  - purge à 30 jours limitée au cabinet ;
  - effacement personnel.
- Tests de bout en bout : point du jour, résumé, rendez-vous confirmé depuis Stive, brouillon envoyé seulement sur clic, accessibilité, écran de 320 px.
- Vraie IA (plus tard) : brancher la reconnaissance sur la passerelle de l'ADR 0026 avec appel d'outils. Elle n'enverra que la question et le strict nécessaire, avec les consignes de Numa (pas de diagnostic, de dosage ni de réassurance) et une évaluation dédiée avant mise en service.
