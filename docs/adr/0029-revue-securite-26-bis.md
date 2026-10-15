# 0029 — Corrections de la revue de sécurité (étape 26 bis)

- Statut : accepté (14 octobre 2026)
- Rapport complet : `docs/securite/revue-26-bis.md`

## Contexte

Avant le feu vert pour les comptes réels, Aaron a demandé une revue de sécurité complète (OWASP, isolation entre cabinets, droits, sessions, limites de tentatives, en-têtes, dépendances). Elle n'a trouvé aucun point critique ni élevé, mais quelques règles devaient changer de forme.

## Décision

1. **Limite d'échecs de connexion réservée avant la vérification.** Chaque tentative prend sa place dans la limite (5 échecs en 15 minutes) avant que le mot de passe soit vérifié ; une connexion réussie la rend (`auth.release_rate_limit`, migration 0020). Des requêtes simultanées ne dépassent donc plus la limite. Le principe de l'ADR 0007 reste : seuls les échecs comptent.
2. **Appareil de confiance à part.** Sur un appareil de confiance, les échecs ont leur propre compteur (adresse + appareil). Des essais venus d'ailleurs ne bloquent plus le vétérinaire sur son poste habituel ; ils restent bloqués partout ailleurs.
3. **Codes e-mail limités par compte** : 6 par heure, soit 30 essais au plus, quelle que soit l'adresse IP.
4. **Réinitialisation sans indice** : le lien est préparé et envoyé après la réponse (`after()` de Next), si bien que la durée de la réponse ne révèle plus si l'adresse a un compte. Elle retire aussi les appareils de confiance.
5. **Numa ne rédige que les simples nouvelles.** Dès que la passerelle IA classe un message en inquiétude, traitement ou question, c'est un texte fixe validé qui part, jamais le texte du modèle. Les garde-fous déterministes restent en dernier filet, élargis aux formulations relevées par la revue.
6. **Photos sans métadonnées** : EXIF, XMP, IPTC et commentaires sont retirés avant le dépôt (JPEG, PNG, WebP), sans réencoder l'image. Une structure illisible est refusée.
7. **Changer le responsable d'un brouillon et le lancer sont deux décisions** : la même requête ne peut pas faire les deux, et seuls l'équipe qui prépare, le responsable actuel ou un administrateur de l'équipe réattribuent un brouillon. Chaque réattribution est journalisée.

## Conséquences

- Une photo JPEG perd son indicateur d'orientation : une photo prise de côté peut s'afficher tournée. WhatsApp applique déjà l'orientation avant l'envoi ; à revoir si un envoi direct de photos arrive.
- Un assistant (sans appareil de confiance) peut encore être bloqué 15 minutes par des essais venus d'ailleurs.
- Le test d'intrusion externe reste prévu avant le premier vrai cabinet.
