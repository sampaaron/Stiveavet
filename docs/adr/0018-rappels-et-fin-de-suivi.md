# 0018 — Rappels planifiés et fin du suivi automatisé : une tâche par étape, jamais les passées

- Statut : accepté (7 octobre 2026)

## Contexte

Phase 2, lot 15. Cahier des charges §3.5 : les messages programmés ne partent que dans la plage d'envoi du cabinet. §5 « Fin et relance » : le suivi automatisé s'arrête à la date de contrôle, la discussion WhatsApp reste ouverte ; si le propriétaire réécrit, Numa peut reprendre la discussion et le vétérinaire est informé. §5 aussi : le vétérinaire peut modifier un suivi en cours, ses prochaines questions et ses rappels. Les étapes de la fiche (lot 12) sont des consignes validées par le vétérinaire, en heures après l'intervention. Architecture : une tâche par envoi ou rappel (ADR 0014).

## Décision

1. **Heure d'envoi** (`domains/suivis/programme.ts`, fonctions pures) : intervention + délai de l'étape, décalée au début de la plage d'envoi suivante du cabinet si elle tombe en dehors, à l'heure de Paris (changements d'heure compris).
2. **Planification après l'accord seulement** : à l'accord du propriétaire (OUI, ou REPRENDRE après un STOP), chaque étape à venir reçoit une tâche `followup.reminder` à clé fixe (`followup:<suivi>:step:<étape>`). Planifier de nouveau ne crée jamais de doublon, et le message envoyé a lui aussi sa clé (`step:<étape>`).
3. **Jamais les passées** : une étape dont l'heure est passée n'est pas envoyée, sauf si elle vient de passer (2 h au plus), auquel cas elle part tout de suite après l'accord. Une étape dont l'heure arrive pendant une pause ou une reprise en main ne part pas, et ne repart pas à la reprise. Aucune étape ne part à partir de la fin du suivi automatisé.
4. **Modification du suivi en cours** : les étapes remplacées perdent leur tâche en attente ; les nouvelles étapes à venir reçoivent la leur ; les messages déjà partis ne changent jamais. Au moment d'envoyer, l'exécutant revérifie que le suivi est actif, que l'accord est donné et que l'étape est toujours dans la fiche.
5. **Rédaction par Numa** : la passerelle IA reçoit le type d'étape, la consigne du vétérinaire, l'animal, le cabinet, la langue et, pour le contrôle, la date du rendez-vous ; la réponse passe par les mêmes garde-fous que les autres (ADR 0016), avec un texte fixe de repli. En simulation, un texte fixe par type d'étape.
6. **Fin du suivi automatisé** : une tâche `followup.end` est planifiée au lancement à la date de contrôle (sans contrôle : un jour après la dernière étape) et replanifiée quand la fiche change ; elle porte l'heure qu'elle applique et ne fait rien si cette heure n'est plus la bonne. À l'heure, le suivi passe à « terminé » (motif `control_date_reached`), les rappels restants sont annulés et Numa envoie un message de clôture qui dit que la conversation reste ouverte. Un suivi réactivé après sa date de contrôle n'a pas de fin automatique : le vétérinaire l'arrête ou fixe un nouveau contrôle.
7. **Après la fin** : si le propriétaire réécrit, Numa lui répond (comme pour un suivi actif) et le vétérinaire responsable est informé par une alerte « à surveiller » dans Stivea Vet (ADR 0017), une seule tant qu'elle n'est pas close. Après un arrêt par le vétérinaire, Numa ne répond plus : les messages sont conservés pour l'équipe.
8. **Dossier** : un encart « Programme du suivi » montre chaque étape avec son état (après l'accord, prévu, envoyé, non envoyé, après la fin) et la fin du suivi automatisé. Le simulateur avance désormais jusqu'au prochain envoi prévu, un clic à la fois.

## Conséquences

- Tests unitaires : heures d'envoi dans et hors plage, passage à l'heure d'hiver et d'été, étapes passées et tout juste passées, fin avec et sans contrôle, textes simulés passés aux garde-fous. Tests d'intégration : aucun rappel avant l'accord, heures identiques au calcul pur, aucun doublon, envoi unique, pause, modification de la fiche, fin périmée sans effet, fin à la date de contrôle, réponse et information après la fin, silence après un arrêt. Parcours e2e sur ordinateur et à 320 px.
- Les rappels de traitement (posologie) restent hors de ce lot : Numa ne crée ni ne modifie une posologie, et les traitements validés seront rappelés quand leur rythme sera saisi de façon structurée.
