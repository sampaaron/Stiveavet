# 0050 — Clés d'accès pour déverrouiller sans retaper le mot de passe

- Statut : accepté (28 octobre 2026), étape 4 du plan « Faire gagner du temps au vétérinaire » (suite de l'ADR 0049)
- Migration 0033 ; complète l'ADR 0007 (authentification) et l'ADR 0039 (sécurité des comptes)

## Contexte

Le plan validé prévoit : « déverrouiller avec l'empreinte ou le visage (clé d'accès) au lieu de retaper le mot de passe. Le verrouillage après 40 minutes reste. »

Un vétérinaire qui passe la matinée au bloc retrouve Stivea Vet verrouillé à chaque retour en consultation. Retaper un mot de passe de 12 caractères ou plus, plusieurs fois par jour, coûte du temps et pousse vers des mots de passe plus faibles.

Le verrouillage lui-même ne change pas (architecture §8). Seule la façon de reprendre une session change.

## Décision

1. **Une clé d'accès ne fait que déverrouiller.**
   - Elle reprend une session déjà ouverte et verrouillée, sur l'appareil où elle a été créée.
   - Elle n'ouvre jamais de session. La connexion garde le mot de passe et, pour un vétérinaire sur un nouvel appareil, le code de sécurité. Une session fermée (12 heures, déconnexion, mot de passe changé, accès retiré) ne se reprend donc pas avec une clé.
2. **Ajout dans « Mon compte », mot de passe à l'appui.**
   - Ouvert à tout membre, pour son propre compte. La personne nomme la clé (« Ordinateur de la consultation ») et confirme son mot de passe : une session laissée ouverte ne suffit pas à poser une clé.
   - Les erreurs de mot de passe comptent avec celles du changement de mot de passe. Cinq erreurs en 15 minutes ferment la session.
   - L'appareil crée la clé (WebAuthn, attestation « none », vérification de la personne exigée : empreinte, visage ou code de l'appareil). Le serveur vérifie la réponse avec `@simplewebauthn/server` avant de l'enregistrer.
   - Au plus 10 clés actives par personne. Une même clé n'appartient qu'à une personne.
   - Un e-mail prévient la personne. Le journal d'activité garde `account.passkey_added`, sans contenu.
   - « Retirer » une clé est journalisé (`account.passkey_removed`). Une clé retirée ne déverrouille plus rien, même avec un défi obtenu avant.
3. **Déverrouillage.**
   - La page verrouillée propose « Déverrouiller avec ma clé d'accès » quand la personne en a une et que le navigateur sait s'en servir. Le mot de passe reste proposé dessous.
   - Le serveur crée un défi à usage unique, valable 5 minutes, lié à cette session verrouillée. Un nouveau défi remplace le précédent.
   - La réponse est acceptée seulement si :
     - elle signe ce défi ;
     - elle vient de l'origine et du site de `APP_URL` ;
     - la personne a été vérifiée sur l'appareil ;
     - la clé appartient à la personne de la session ;
     - le compteur de signatures progresse (une clé copiée ou une réponse rejouée est refusée).
   - Les échecs comptent avec ceux du mot de passe (5 en 15 minutes ferment la session) et sont journalisés `unlock_failed`. Une réussite est journalisée `session_unlocked_passkey`, distincte du déverrouillage par mot de passe.
4. **Stockage.**
   - Tables `auth.passkeys` (clé publique COSE, compteur, transports, nom) et `auth.webauthn_challenges`, sans aucun droit direct pour l'application.
   - Comme pour les autres fonctions de `auth`, chaque fonction part de l'empreinte du jeton de la session courante, jamais d'un identifiant choisi par l'application. Enregistrer une clé exige une session déverrouillée ; demander un défi de déverrouillage, une session verrouillée.
   - Aucun secret n'est stocké : la clé privée ne quitte jamais l'appareil.
   - Les défis échus sont purgés chaque jour, et les clés retirées après 30 jours (`auth.purge_expired`).
5. **Réponses du navigateur.** Elles arrivent en texte borné (40 000 caractères), puis sont validées par Zod (base64url, longueurs, type `public-key`) avant toute vérification. Les extensions sont écartées et les transports inconnus ignorés.

## Conséquences

- Le vétérinaire reprend Stivea Vet d'un geste après chaque absence. La protection est la même qu'avec le mot de passe : la clé prouve l'appareil et la personne, et les essais restent limités.
- Le site des clés est le nom d'hôte de `APP_URL`. Changer de domaine rend les clés existantes inutilisables : chacun en recrée une, et le mot de passe déverrouille entre-temps.
- La valeur `session_unlocked_passkey` du journal de connexion reste dans la base si la migration est annulée (PostgreSQL ne retire pas une valeur d'énumération).
- Le test d'intrusion prévu avant le premier vrai cabinet couvrira ce parcours.
