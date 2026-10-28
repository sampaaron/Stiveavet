# 0046 — Prêts à lancer et temps gagné

- Statut : accepté (28 octobre 2026), étape 1 du plan « Faire gagner du temps au vétérinaire »
- Migration 0030 ; complète l'ADR 0015 (lancement d'un suivi)

## Contexte

Aaron a constaté que Stivea Vet demandait plus de temps au vétérinaire qu'il n'en faisait gagner. Le plus coûteux était le lancement : environ neuf actions sur trois écrans par animal opéré, que le vétérinaire refaisait entre deux consultations. Le plan validé (doc « Faire gagner du temps au vétérinaire ») commence par trois gains rapides : une file « Prêts à lancer », les traitements importés validés en une fois et le temps gagné affiché.

Le cahier des charges ne change pas : seul le vétérinaire responsable lance un suivi et valide un traitement importé (§4 et §5), et le bilan doit estimer le temps économisé (§17).

## Décision

1. **File « Prêts à lancer » sur la vue d'ensemble.**
   - Elle montre les brouillons (hors suivis test) que la personne peut préparer, avec l'accès clinique : protocole, premier message, contrôle, traitements importés à valider, et ce qui manque encore (fiche incomplète, WhatsApp à relier, accord du propriétaire à noter).
   - L'assistante prépare la fiche et note l'accord WhatsApp à l'accueil. Le vétérinaire n'a plus qu'à relire la carte.
   - Seul le vétérinaire responsable voit le bouton « Lancer » ; les autres lisent « Prête, attend Dr … ».
2. **Lancer en un clic, ou « Tout lancer ».**
   - Le clic valide, au nom du vétérinaire, exactement les traitements importés affichés sur la carte, puis lance le suivi avec les contrôles habituels (ADR 0015).
   - Le formulaire renvoie la liste des traitements relus. Si elle ne correspond plus à la fiche (traitement ajouté, retiré ou déjà validé entre-temps), rien n'est fait pour ce suivi : le vétérinaire ne valide jamais un traitement qu'il n'a pas vu.
   - « Tout lancer » demande une confirmation. Chaque suivi est lancé dans sa propre transaction ; les fiches qui ont changé sont comptées et restent en brouillon.
   - Le journal garde `via: "queue"` sur le lancement et sur la validation des traitements.
3. **Fiche de lancement.**
   - Un bouton « Valider les N traitements importés » remplace les cases une à une (la décision reste enregistrée seulement avec la fiche).
   - Quand l'accord WhatsApp est déjà noté pour chaque contact qui écrira, la case disparaît au profit d'une ligne « Accord déjà noté au cabinet ». Activer un second propriétaire sans accord la fait revenir, décochée.
4. **Temps gagné, estimation affichée avec son calcul.**
   - 4 minutes par prise de nouvelles faite par Numa à la place d'un appel de l'équipe (premier message et étapes programmées, partis au moins une fois), moins 1 minute par suivi lancé, sur 30 jours, jamais sous zéro.
   - Les réponses de Numa aux questions des propriétaires ne sont pas comptées : l'estimation reste prudente.
   - Le nombre vient de `app.activity_check_ins` (migration 0030). Comme les autres compteurs du tableau de bord (0028), la fonction ne rend qu'un nombre, sans dépendre des droits sur chaque dossier, et refuse de s'exécuter hors d'un cabinet.
   - Les constantes sont dans `src/domains/suivis/temps-gagne.ts`, seul endroit à changer quand des cabinets pilotes auront mesuré leurs vrais temps.

## Reporté

- **Accord WhatsApp donné par le propriétaire sur un QR code, à l'accueil.** Il demande une page publique, des jetons à usage unique et une protection contre les abus : il fera l'objet d'une décision à part. En attendant, l'assistante coche l'accord recueilli à l'accueil, comme avant.
- **Responsable d'office : le vétérinaire de l'intervention.** L'import dr.veto ne donne pas encore le praticien de l'intervention ; il viendra avec « Opérés du jour » (étape 2), qui lit l'agenda des chirurgies. Le responsable proposé reste le vétérinaire qui prépare, sinon le premier vétérinaire actif.

## Conséquences

- Le lancement passe de neuf actions à un clic pour le vétérinaire, quand l'équipe a préparé la fiche.
- Aucun garde-fou n'est retiré : les droits, l'accord WhatsApp, la validation des traitements et le journal restent ceux de l'ADR 0015.
- Les messages fictifs de démonstration marquent le premier message de Numa comme un premier message, pour que le temps gagné s'affiche en local.
