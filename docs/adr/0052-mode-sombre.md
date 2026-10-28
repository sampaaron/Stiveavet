# 0052 — Mode sombre de l'espace cabinet

- Statut : accepté (28 octobre 2026), demande d'Aaron : « un mode sombre qu'on peut activer dans les réglages du cabinet »
- Migration 0035 ; même modèle que la langue de l'interface (ADR 0022)

## Contexte

L'espace cabinet n'existait qu'en clair. Les vétérinaires le consultent aussi le soir, en garde ou au bloc, où un écran blanc éblouit.

## Décision

1. **Un réglage « Mode » à trois choix** : Clair, Sombre, Automatique. Automatique suit le réglage de l'ordinateur ou du téléphone.
   - Il est proposé en tête des Réglages, comme demandé. Il figure aussi dans Mon compte, car les Réglages sont réservés à l'administrateur et chacun doit pouvoir choisir.
   - Chaque mode est un bouton : le choix s'enregistre d'un clic, même sans JavaScript.
2. **Un choix par personne, pas par cabinet.** Un vétérinaire peut être en sombre et l'assistante en clair.
   - Le compte le garde (`users.color_mode`, clair par défaut). La base n'accepte que la ligne de la personne elle-même (droit par colonne, RLS).
   - Un cookie (`sv_mode`, `__Host-` en HTTPS) le porte jusqu'au rendu serveur. La page arrive donc déjà dans le bon mode, sans éclair blanc. Il est recalé sur le compte à chaque connexion.
   - C'est une simple préférence : aucun accès n'en dépend, rien n'est journalisé.
3. **Les couleurs passent par les jetons.**
   - `data-mode` sur `<html>` et une variante Tailwind `dark:` redéfinissent les jetons : nuit verte du site, textes clairs, teintes de gravité éclaircies.
   - Les fonds pleins (bouton, pastille d'urgence) portent un texte `on-strong`, blanc en clair et nuit en sombre.
   - Chaque rubrique garde sa teinte, dans une variante éclaircie (`--section-accent-night`).
   - Chaque paire texte et fond dépasse 4,5:1. Un test de bout en bout passe 17 écrans en sombre à axe.
4. **Le site public garde ses propres couleurs** quel que soit le mode. Il est déjà sombre (ADR 0043).

## Conséquences

- Une nouvelle couleur s'écrit avec un jeton (`bg-surface`, `text-ink`…) et non avec `white` ou un code en dur. Sinon, elle doit prévoir sa variante `dark:`.
- Le QR code d'accord garde son fond blanc, nécessaire à la lecture par le téléphone.
