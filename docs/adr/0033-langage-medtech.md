# 0033 — Langage visuel « medtech » des écrans du cabinet

- Statut : accepté (14 octobre 2026), prolonge l'ADR 0032
- Pas de migration

## Contexte

Après la refonte de l'ADR 0032, Aaron demande que chaque page de l'espace cabinet adopte un style « très innovant, très medtech ». Les écrans gardent leurs fonctions et leurs droits ; seule leur présentation change.

## Décision

1. **Instruments de mesure.**
   - Le fond du panneau porte un quadrillage millimétré très discret.
   - Une police à chasse fixe (JetBrains Mono, embarquée, sans appel externe) sert aux relevés : chiffres clés, jour post-opératoire (J+n), heures de créneaux, horodatage du journal, champs d'heure.
   - Les étiquettes de relevé et les en-têtes de colonnes sont en petites capitales espacées (`tech-label`). Les phrases et les dates écrites en toutes lettres restent dans la police de texte.
2. **Repères.**
   - Chaque titre de section porte un trait vertical vert.
   - Les badges d'état deviennent des étiquettes à angles droits avec un bord teinté ; l'urgence y ajoute un témoin lumineux qui pulse.
   - L'animation s'arrête quand le système demande moins de mouvement, et le libellé porte toujours le niveau : la couleur ou le mouvement seuls ne portent aucune information.
3. **Listes en tableau clinique.**
   - Suivis et animaux s'affichent en lignes à colonnes (patient, suivi ou signalement, responsable ou propriétaires, contrôle ou statut).
   - Un rail de gravité à gauche de la ligne double le badge.
   - La progression vers le contrôle est une jauge décorative ; la date de contrôle reste écrite.
4. **Fiche patient.** Le dossier d'un suivi et la fiche d'un animal s'ouvrent sur une fiche commune (`PatientHeader`) :
   - identité et badges ;
   - relevé « Post-op J+n » ;
   - frise de J0 au contrôle ;
   - grille de constantes : espèce, âge, poids, responsable, contrôle, protocole.

   Un tracé de moniteur en filigrane sert de décor. Il n'est jamais lu par les lecteurs d'écran et ne représente aucune donnée.

5. **Alertes en moniteur.** Les bandeaux d'alerte ont un rail de gravité, un fond dégradé et une icône carrée. Le journal d'activité devient une frise horodatée.

## Conséquences

- Aucun changement de droits, de données, d'isolation ni de textes envoyés aux propriétaires.
- Le tracé de moniteur est purement décoratif. Il ne doit jamais laisser croire à une mesure réelle : Stivea Vet ne relève aucune constante.
- Les sélecteurs des tests de bout en bout sont inchangés.
