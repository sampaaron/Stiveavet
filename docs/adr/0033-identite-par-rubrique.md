# 0033 — Refonte élégante : une identité par rubrique

- Statut : accepté (15 octobre 2026), prolonge l'ADR 0032
- Pas de migration

## Contexte

Après la refonte de l'ADR 0032, deux pistes ont été proposées à Aaron :

- une interface « medtech » (quadrillage, chiffres en police technique, tableaux cliniques) ;
- une interface « élégante » où chaque rubrique a son propre caractère.

Le 15 octobre, Aaron a choisi la piste élégante après l'avoir vue tourner sur son poste. La piste medtech n'est pas retenue.

## Décision

1. **Une identité par rubrique.**
   - Chaque rubrique (`src/ui/sections.ts`) a une teinte d'accent, choisie pour un contraste d'au moins 4,5:1 sur blanc, et une lueur claire.
   - `SectionFrame` pose la rubrique courante et dessine en tête de page un fond de lueurs et un motif au trait propre à la rubrique.
   - Dans la barre latérale, l'entrée active s'allume dans la teinte de sa rubrique.
2. **Décor seulement.**
   - La teinte et le motif ne portent aucune information. Ils sont masqués aux lecteurs d'écran.
   - Les niveaux de gravité gardent leurs couleurs et leurs libellés (« Urgent », « À surveiller »), quelle que soit la rubrique.
3. **Écrans.**
   - Connexion en deux parties : un panneau de marque sombre (Numa et Stive, toujours présentés comme des assistants IA) et le formulaire.
   - Suivis, animaux et protocoles sont présentés en cartes.
   - Agenda en frise par jour.
   - Équipe avec monogrammes.
   - Formule de facturation mise en avant.
   - Journal en ligne du temps.
   - Onglets en pastilles (`SegmentedTabs`) : ce sont des liens, avec l'onglet courant signalé par `aria-current`.
4. **Mouvement.** Chaque écran apparaît en douceur. L'animation est coupée quand le système demande moins de mouvement.

## Conséquences

- Aucun changement de droits, de données, d'isolation ni de textes envoyés aux propriétaires.
- Ajouter une rubrique demande d'ajouter sa teinte et son motif ; à défaut, elle prend l'identité d'« Aujourd'hui ».
- Les sélecteurs des tests de bout en bout restent ceux de l'ADR 0032.
