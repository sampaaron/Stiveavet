# 0043 — Vitrine sur la trame de Limova, film de présentation

- Statut : accepté (20 octobre 2026), prolonge l'ADR 0033 pour le site public
- Pas de migration

## Contexte

Aaron trouve la vitrine trop éloignée du logiciel. Il demande :

- de reprendre la trame du site de Limova, avec les couleurs et les informations de Stivea Vet ;
- d'ajouter un film de présentation au même endroit que chez Limova ;
- d'abandonner la police à empattement en italique.

## Décision

1. **Thème sombre du site.**
   - `.theme-site` (posée par `src/app/[lang]/layout.tsx`) redéfinit les jetons : nuit verte, textes clairs, contrastes d'au moins 4,5:1.
   - Les aperçus du logiciel (`AppPreview`, `PhoneDemo`, espace de démonstration) portent `.theme-light` et gardent les couleurs claires de l'application.
   - Les sections du site reprennent l'identité des rubriques de l'ADR 0033 (`SectionBackdrop`, `SectionMotif`, partagés avec l'espace cabinet). Sur la nuit, la teinte claire de la rubrique sert d'accent.
2. **Trame de l'accueil.** Dans l'ordre :
   - bandeau d'annonce ;
   - héros centré avec le portrait de Numa et une question fictive posée à Numa ;
   - film ;
   - Numa et Stive en onglets ;
   - bloc WhatsApp ;
   - avant / après et engagements ;
   - intégrations en tuiles, avec leur statut réel (« Au lancement », « Bientôt disponible ») ;
   - démarrage en étapes ;
   - sécurité, questions fréquentes, appel final.
3. **Pas de preuve sociale inventée.** Les compteurs de clients et les avis de Limova ne sont pas repris : Stivea Vet n'en a pas encore. Ils seront ajoutés avec de vrais avis.
4. **Typographie.** Les titres utilisent la même grotesque que le texte (Plus Jakarta Sans), en graisse forte, sans italique. Fraunces est retirée du projet, espace cabinet compris.
5. **Film de présentation** (`public/video/stivea-vet-film.mp4`, 59 s, 1080p, H.264 et AAC).
   - Il démarre sans son, en boucle, sauf si la personne demande moins d'animations. Un bouton active le son.
   - La première image est le logo du cabinet : elle sert de miniature (`stivea-vet-film-poster.jpg`).
   - Sous-titres incrustés, données fictives. Numa et Stive y sont toujours présentés comme des assistants IA.
   - Musique et effets sont synthétisés, sans échantillon ni voix de tiers.
   - Le film est servi par le site lui-même : la politique de sécurité du contenu (`default-src 'self'`) n'est pas élargie.

## Conséquences

- Le site public et le logiciel partagent les mêmes rubriques, teintes et motifs.
- Le film pèse 19 Mo dans le dépôt. Une nouvelle version remplace le fichier sous le même nom.
- La vidéo garde des sous-titres français sur la version anglaise du site ; son libellé le signale.

## Intégration à la version GitHub (25 octobre 2026)

Cette vitrine a d'abord été faite sur le poste d'Aaron, puis reprise sur la branche auditée (ADR 0038 à 0041). Seuls le site public, le thème, les motifs partagés et le retrait de Fraunces sont repris. Les prix, l'offre de lancement (ADR 0037), Stive et « Mon compte » restent ceux de la version GitHub : le bandeau d'annonce lit le taux, la durée et la date de fin dans `INTRO_OFFER`, sans les recopier. Le visuel propre à chaque page intérieure et le centre d'aide gardent leur contenu. Le bouton final du film affichait « dès 119 € » : il est corrigé à « dès 89 € » directement dans l'image, le reste du film est inchangé.
