# 0032 — Refonte visuelle de l'espace cabinet

- Statut : accepté (14 octobre 2026), précise la notification « à surveiller » de l'ADR 0017
- Pas de migration

## Contexte

Aaron trouve le design trop générique et demande une interface plus ergonomique, dans l'esprit de Limova. Limova présente ses agents IA comme des personnages, ouvre son accueil sur une grande barre centrale et utilise des boutons en pilule sur un fond sombre.

L'audit design du 14 octobre relevait aussi trois défauts :

- le bandeau rouge des alertes répété en haut de chaque page ;
- des contrôles natifs qui ne suivent pas le style de l'application ;
- de longues pages de réglages sans repères.

## Décision

1. **Structure.**
   - La barre latérale passe en nuit verte avec des lueurs menthe. Elle porte le bouton « Nouveau suivi » et une section « Assistants IA », où Numa apparaît avec son portrait.
   - Le contenu reste clair, dans un panneau arrondi, pour que les niveaux de gravité (ambre, rouge) gardent leur contraste.
   - Les titres de page utilisent la police à empattement du site public.
   - Les boutons et les puces de navigation sont en pilule, avec des cibles d'au moins 44 px pour les boutons principaux.
2. **Accueil.**
   - Le tableau de bord s'ouvre sur « Le point de Numa ». Il donne des décomptes, jamais un avis médical, et porte la mention « Assistante IA ».
   - Une grande barre de recherche des suivis et des raccourcis suivent.
   - Les chiffres clés tiennent dans une seule carte. L'activité sur 30 jours passe en bas de page.
3. **Recherche.**
   - Sur les autres écrans, une barre en tête cherche dans les suivis (touche « / »).
   - Elle mène à la liste des suivis filtrée : le serveur n'y montre que ce que la personne a le droit de voir.
4. **Notification des alertes (précise l'ADR 0017, point 4).**
   - Le décompte des alertes sans accusé de réception est toujours visible : pastille sur « Alertes » dans la barre latérale et cloche dans l'en-tête mobile et la barre de recherche.
   - Le bandeau rouge ne s'affiche plus que pour une urgence sans accusé de réception, et jamais sur le tableau de bord ni sur l'écran Alertes, qui la montrent déjà en détail.
   - Une alerte « à surveiller » reste une notification dans Stivea Vet, sans WhatsApp ni escalade.
   - Aucun contenu clinique dans ces rappels.
5. **Libellés.**
   - Le statut « Normal » devient « Rien à signaler » (« Nothing flagged »), qui ne se lit pas comme un avis médical.
   - Les animaux sont représentés par leur initiale sur une pastille, plutôt que par une icône identique pour tous.
6. **Stive** n'a pas encore d'écran à lui : son entrée de menu est retirée tant que l'écran n'existe pas, pour ne pas mener à une page vide.
7. **Réglages.** « Numa, urgences et garde » gagne un sommaire collant (« Sur cette page »). Les listes déroulantes, champs d'heure et sélecteurs de fichier sont dessinés comme le reste de l'interface.
8. **Site public.** Les pages intérieures reprennent la nuit et les halos de l'accueil ; l'alerte flottante du héros ne recouvre plus le texte.

## Conséquences

- Aucun changement de droits, de données ni d'isolation : la refonte ne touche qu'à l'apparence, à l'agencement et à des libellés.
- Les tests de bout en bout gardent leurs sélecteurs. Seul le libellé « Rien à signaler » change dans le catalogue des composants.
