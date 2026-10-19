# 0035 — Vitrine sur la trame de limova.ai, vidéo et une seule police

- Statut : accepté (19 octobre 2026), demande d'Aaron
- Pas de migration

## Contexte

Le 19 octobre, Aaron a demandé une vitrine qui reprenne la structure de celle de limova.ai, aux couleurs et avec les informations de Stivea Vet. Sa vidéo de présentation, validée en v4, doit être placée au même endroit que celle de Limova. Il ne veut plus de la police de titres « un peu italique » (Fraunces).

La page d'accueil de Limova s'enchaîne ainsi :

1. un héros avec une note d'avis et une démonstration de demande à un agent ;
2. des logos de médias ;
3. la vidéo ;
4. les agents ;
5. l'offre WhatsApp ;
6. des avis clients ;
7. les intégrations ;
8. les étapes ;
9. un aperçu de l'application ;
10. une FAQ en onglets ;
11. des logos de partenaires.

## Décision

1. **Même trame, contenus vrais.**
   - Stivea Vet n'a ni avis, ni presse, ni partenaires. Aucune note, aucun avis et aucun logo n'est inventé.
   - Leurs emplacements portent des faits vérifiables :
     - un bandeau défilant des protocoles fournis ;
     - « Ce qui change pour le cabinet » ;
     - les engagements et la sécurité.
   - La démonstration du héros est une demande à Stive, signalée comme fictive.
   - L'aperçu du logiciel est une capture réelle du tableau de bord, avec des données fictives.
2. **Vidéo.**
   - Elle se place juste sous le héros, comme chez Limova. Elle démarre en sourdine et en boucle, avec un bouton « Activer le son ».
   - Elle ne démarre pas toute seule si l'animation est réduite.
   - Des sous-titres en français et en anglais reprennent les textes affichés à l'écran.
   - Le logo d'Aaron sert d'image d'attente.
   - Les fichiers sont servis par l'application (`public/videos`), sans domaine tiers, ce que la CSP impose.
3. **Sombre et en pilules.**
   - Le site public passe à la nuit verte de la barre latérale de l'app (`--color-night`), à la place du bleu nuit, avec des lueurs menthe, vertes et or.
   - L'en-tête est sombre. Les boutons sont en pilule. L'appel principal est menthe sur fond sombre.
   - Un menu « Assistants IA » regroupe Numa et Stive, avec leur portrait et leur mention IA.
4. **Une seule police.** `--font-display` devient Plus Jakarta Sans, en gras. Fraunces est retiré du projet, ce qui vaut aussi pour les titres de l'espace cabinet.
5. **Accessibilité.**
   - Les questions fréquentes sont en onglets ARIA, utilisables avec les flèches, Début et Fin.
   - Le bandeau défilant s'arrête et passe à la ligne si l'animation est réduite. Sa copie décorative est masquée aux lecteurs d'écran.

## Conséquences

- Les tests du site (langue, titre, accessibilité, appel principal, Numa et Stive présentés comme des IA) restent inchangés et passent.
- Remplacer la vidéo revient à remplacer `public/videos/stivea-vet-presentation.*`, ses sous-titres compris.
