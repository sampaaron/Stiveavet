# 0024 — WhatsApp Business Cloud API

- Statut : accepté (8 octobre 2026)

## Contexte

Phase 3, lot 21. Jusqu'ici WhatsApp était simulé (ADR 0004). Le branchement réel est codé maintenant, sans compte ni clé : tant qu'Aaron n'a pas ouvert les comptes Meta (partie B du plan de la phase 3), tout se vérifie contre une imitation locale de l'API de Meta.

Contraintes de WhatsApp qui changent le produit :

- hors d'une fenêtre de 24 h ouverte par le dernier message du propriétaire, seuls des modèles approuvés par Meta peuvent partir ;
- aucun premier message sans accord donné ailleurs (au cabinet) ;
- les groupes sont réservés aux comptes officiels.

## Décision

1. **Un connecteur par cabinet.** Chaque cabinet relie son propre numéro par l'inscription intégrée de Meta (« Embedded Signup »), depuis Réglages ou l'installation guidée.
   - Le navigateur ne reçoit qu'un code à usage unique ; le serveur l'échange contre le jeton du cabinet, vérifie que le numéro appartient au compte annoncé, abonne l'application aux webhooks et inscrit le numéro avec un code PIN, jamais gardé.
   - Le jeton est chiffré par l'application (AES-256-GCM, `src/server/crypto/secret-box.ts`), avec le cabinet comme contexte authentifié : copié vers la ligne d'un autre cabinet, il ne se déchiffre pas. Les clés (`SECRETS_ENCRYPTION_KEYS`) viennent du gestionnaire de secrets ; la première chiffre, toutes déchiffrent (rotation).
   - Un numéro ne sert qu'à un cabinet (index unique, refus `whatsapp_number_taken`).
2. **Coupure franche** (`WHATSAPP_PROVIDER`) : `simulated` est refusé hors du poste local ; `cloud_api` exige toutes ses clés au démarrage. Une erreur de configuration ne cite que des noms de variables.
3. **Une tâche par message** (`whatsapp.send`). Le message est écrit d'abord, puis envoyé par la file, qui revérifie tout au moment d'envoyer (accord retiré, groupe fermé). Dans une conversation, les envois partent dans l'ordre d'écriture.
4. **Modèles et texte libre.**
   - Les textes fixes (premier message, nouvelles, rappel, clôture, rendez-vous, invitation à répondre, alertes) sont des modèles du catalogue `src/domains/whatsapp/modeles.ts`, en français et en anglais, catégorie utilitaire. Le texte gardé dans la conversation est le texte rendu : ce qui est gardé est ce qui part. `pnpm whatsapp:modeles` exporte les demandes d'approbation.
   - Le texte libre (Numa, vétérinaire) ne part que fenêtre ouverte, avec 30 minutes de marge. Sinon il attend (`awaiting_reply`) et une invitation à répondre, sans contenu clinique, part en modèle. Il part dès que le propriétaire répond.
5. **Accord au cabinet.** La fiche de lancement porte une case obligatoire : le propriétaire a accepté au cabinet d'être contacté sur WhatsApp. Elle est gardée avec son auteur et sa date, et journalisée. Le premier message de Numa demande ensuite l'accord au suivi lui-même (ADR 0016).
6. **Deux propriétaires** : avec le connecteur réel, pas de groupe ; chacun a sa conversation (texte d'accord `consentement-deux-v1`). Les groupes restent possibles en simulation.
7. **Webhook** `/api/webhooks/whatsapp` (absent en simulation) :
   - signature `X-Hub-Signature-256` vérifiée sur le corps brut, en temps constant, corps limité à 1 Mo ;
   - le cabinet se déduit seulement du numéro Meta destinataire, par une fonction de la base qui ne renvoie que son identifiant ;
   - chaque message et chaque accusé n'est traité qu'une fois (`webhook_events`, sans contenu) ;
   - un accusé ne fait qu'avancer l'état d'un message (envoyé, remis, lu). Un échec signalé après coup remet la tâche en échec et prévient le vétérinaire ;
   - un message reçu va au suivi du message auquel il répond, sinon au suivi le plus récemment actif avec ce numéro.
8. **Échecs.** Un échec temporaire est réessayé par la file. Un échec définitif (numéro injoignable, modèle refusé, compte à reconnecter) met la tâche en échec tout de suite, sans nouvel essai. Le vétérinaire responsable reçoit alors au plus un e-mail par heure, sans nom ni contenu, avec un lien vers chaque suivi (cahier des charges §15). Comme une tâche en échec annule ce qu'elle a écrit, le motif du message est posé par l'exécutant d'échec, d'après le code de la tâche.
9. **Alertes urgentes** des vétérinaires : envoyées en modèle au numéro WhatsApp professionnel choisi par chaque vétérinaire (page Alertes), jamais à son numéro personnel par défaut. Sans numéro choisi, l'alerte reste dans Stivea Vet et la livraison est en échec visible.
10. **En-têtes** : la CSP n'autorise les domaines de Meta, et COOP n'autorise la fenêtre de Meta (`same-origin-allow-popups`), que sur Réglages et l'installation guidée, et seulement en mode réel.

## Conséquences

- Tests contre l'imitation de Meta (`src/adapters/whatsapp/imitation.ts`), jamais branchée hors tests : inscription, jeton chiffré, numéro déjà pris, modèle envoyé identique au texte gardé, fenêtre fermée puis rouverte, webhooks signés, rejoués ou falsifiés, accusés dans le désordre, échecs immédiats ou signalés après coup, e-mail sans contenu.
- À l'ouverture des comptes (partie B) : application Meta et configuration de l'inscription intégrée, modèles soumis et approuvés, URL du webhook et jeton de vérification, clés de chiffrement générées dans le gestionnaire de secrets. Les textes des modèles passent par le juriste avant la production (§19).
- Risque résiduel de doublon : si la réponse de Meta se perd après un envoi réussi, la tentative suivante peut renvoyer le message, sauf si un accusé est arrivé entre-temps. Meta n'offre pas de clé d'idempotence ; la référence du message (`biz_opaque_callback_data`) relie tout de même l'accusé au bon message.
- Les photos et vocaux reçus par le webhook arrivent au lot 22 ; ils sont ignorés d'ici là.
- La fonction de routage du webhook lit `whatsapp_accounts` hors du contexte d'un cabinet (SECURITY DEFINER) ; elle ne renvoie que l'identifiant du cabinet, jamais le jeton.
