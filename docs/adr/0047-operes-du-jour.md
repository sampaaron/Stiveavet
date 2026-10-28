# 0047 — Opérés du jour

- Statut : accepté (28 octobre 2026), étape 2 du plan « Faire gagner du temps au vétérinaire »
- Complète les ADR 0015 (lancement) et 0046 (prêts à lancer) ; aucune migration

## Contexte

Avec l'étape 1, le vétérinaire lance en un clic une fiche que l'équipe a préparée. Il restait à préparer chaque fiche : chercher l'animal dans dr.veto, ouvrir la fiche, noter l'accord WhatsApp. Le plan prévoit que la liste des opérés arrive seule, que le responsable soit d'office le vétérinaire qui a opéré, et que l'équipe voie d'un coup d'œil les dossiers qui n'ont besoin de rien.

## Décision

1. **« Opérés du jour » sur la vue d'ensemble.**
   - Le connecteur dr.veto donne les animaux opérés dans la journée (heure de Paris) : animal, intervention, heure, praticien. Lecture seule, sans donnée clinique détaillée.
   - Chaque ligne dit où en est l'animal dans Stivea : rien encore, fiche prête à lancer ou suivi en cours.
   - « Préparer la fiche » crée le brouillon comme la recherche (ADR 0015) : protocole proposé d'après l'intervention, premier message et contrôle préremplis. « Tout préparer » le fait pour chaque animal qui n'a pas encore de fiche, une transaction par animal ; un animal déjà suivi est passé.
   - Visible pour qui prépare les fiches avec l'accès clinique, quand dr.veto est relié au cabinet.
2. **Responsable d'office : le vétérinaire qui a opéré.**
   - dr.veto donne le nom du praticien. S'il correspond à un seul vétérinaire actif du cabinet (accents et majuscules mis à part), il devient responsable ; sinon, la règle d'avant s'applique (le vétérinaire qui prépare, sinon le premier vétérinaire actif).
   - Un vétérinaire qui ne voit que ses suivis perdrait l'accès clinique à la fiche d'un confrère (politique `clinical_access`, ADR 0038). Il reste donc responsable de la fiche qu'il prépare, et « Opérés du jour » ne lui montre que ses opérés et ceux d'un praticien hors de l'équipe. L'assistante et l'administrateur, qui voient la liste du cabinet, préparent pour tous.
3. **Accord WhatsApp noté depuis « Prêts à lancer ».**
   - Une fiche bloquée sur l'accord porte le bouton « Noter l'accord du propriétaire » : l'accord recueilli à l'accueil, noté en un clic par qui prépare la fiche, journalisé (`followup.whatsapp_optin`, `via: "queue"`).
   - L'accord ne vaut que pour les contacts qui écriront. Le second propriétaire n'en profite que s'il est inclus au moment où l'accord est noté, depuis la fiche comme depuis la vue d'ensemble.
4. **« Rien à signaler » d'un coup d'œil.**
   - Sur la vue d'ensemble, les suivis sans alerte tiennent en une ligne repliée (« 7 suivis : rien à signaler »), avec leur voyant vert. Les urgences et les cas à surveiller restent dépliés, en tête.
   - Le voyant vient du triage par les règles d'alerte du protocole validé par le vétérinaire (lot 13), jamais d'un avis de Numa.

## Conséquences

- Pour un animal opéré, le travail tombe à trois clics sur une seule page : préparer, noter l'accord, lancer. Les deux premiers peuvent être faits par l'assistante.
- Les fiches dr.veto fictives donnent un praticien à sept animaux, dont deux opérés par le Dr Hugo Marchal, pour montrer une fiche qui attend son responsable.
- Le QR code à l'accueil reste à concevoir à part (ADR 0046).
