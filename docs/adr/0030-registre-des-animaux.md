# 0030 — Registre des animaux et lancement sans dr.veto

- Statut : accepté (14 octobre 2026)
- Migration : `0021_registre_des_animaux`

## Contexte

Jusqu'ici, un animal n'entrait dans Stivea Vet que par l'import dr.veto d'un suivi. Sans l'API dr.veto (lot 25 en attente), un cabinet ne pouvait donc pas tester le produit avec ses propres patients. Le cahier des charges du MVP demande la gestion des animaux et des propriétaires (identité, espèce, race, âge, coordonnées, notes, statut, historique) et un lancement de suivi « en quelques clics ».

## Décision

1. **Registre dans le domaine `patients`.** Création, modification, archivage et suppression d'un animal avec un ou deux propriétaires. Lecture et écriture demandent `followups.launch` : ce sont les personnes qui préparent les suivis. Les notes internes demandent en plus `clinical.read` ; sans elle, elles ne sont ni lues ni réécrites.
2. **Propriétaire reconnu par son numéro.** Un numéro WhatsApp déjà connu du cabinet rattache l'animal au propriétaire existant (la sécurité par ligne limite la recherche au cabinet). Un nouveau numéro s'ajoute au propriétaire : les suivis déjà lancés gardent celui de leur lancement, l'ancien disparaît s'il ne sert plus. L'e-mail est un contact `email` de `owner_contacts`, prévu dès la migration 0001.
3. **Lancement depuis la fiche.** `launchService.prepareFromAnimal` crée le même brouillon que l'import dr.veto (fonction commune `insertDraft`) : intervention saisie, protocole choisi ou proposé, propriétaires comme contacts (le second inactif). La fiche de lancement, l'accord WhatsApp recueilli au cabinet et le lancement par le vétérinaire responsable ne changent pas.
4. **Historique au niveau autorisé.** La fiche montre chaque suivi au niveau de détail que donne `followupAccess` ; un dossier privé apparaît seulement comme « suivi non partagé avec vous ».
5. **Effacement.** Le rôle applicatif n'a toujours pas le droit `DELETE` sur `animals`. `app.delete_unused_animal` efface un animal sans suivi ni rendez-vous et ses propriétaires orphelins : à la demande du cabinet (saisie par erreur), ou par le balayage quotidien quinze mois après la création, comme un suivi jamais terminé. Un animal qui a eu un suivi suit la conservation de ses suivis.
6. **Journal** : `animal.created`, `animal.viewed`, `animal.updated`, `animal.archived`, `animal.restored`, `animal.deleted`, `animal.purged`, et `followup.prepared` avec `source: manual`. Aucune donnée nominative dans les métadonnées.

## Conséquences

- Un animal importé plus tard depuis dr.veto avec la même identité crée une seconde fiche : le rapprochement se fera avec l'API réelle (lot 25).
- Deux personnes qui partagent un numéro sont un seul propriétaire pour le cabinet.
- Le tableau de bord ajoute des totaux d'activité du cabinet (`suivis/statistiques.ts`) : comptes seulement, aucun détail de dossier, suivis test exclus.
