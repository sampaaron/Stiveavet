# Revue de sécurité — étape 26 bis (14 octobre 2026)

Revue du code de `main` + lots 20 à 26, avant le feu vert pour les comptes réels. Trois axes, relus fichier par fichier : connexion et sessions, isolation entre cabinets et droits, entrées non fiables et dépendances. Les décisions qui en découlent sont dans l'ADR 0029.

**Bilan : aucun point critique ni élevé. 11 points corrigés, 2 à vérifier en staging.**

## Points corrigés

| #   | Gravité          | Point                                                                                                                                                                                                                   | Correction                                                                                                                     |
| --- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Moyenne          | Des connexions envoyées en même temps dépassaient la limite de 5 échecs par compte (le compteur était lu, puis incrémenté après la vérification du mot de passe).                                                       | La tentative réserve sa place avant la vérification ; une réussite la rend. Test : 12 tentatives simultanées, 5 vérifiées.     |
| 2   | Moyenne          | Le code e-mail n'avait de limite que par code : quelqu'un qui connaît le mot de passe pouvait demander des codes en boucle depuis plusieurs adresses IP.                                                                | 6 codes par heure et par compte.                                                                                               |
| 3   | Moyenne          | La demande de réinitialisation répondait plus lentement quand l'adresse avait un compte (envoi de l'e-mail).                                                                                                            | Lien préparé et envoyé après la réponse ; un échec d'envoi ne se voit plus.                                                    |
| 4   | Moyenne          | Les webhooks WhatsApp et Stripe lisaient tout le corps avant de vérifier sa taille : un envoi sans `Content-Length` pouvait remplir la mémoire.                                                                         | Lecture interrompue dès la limite dépassée (`readCappedBody`), partagée avec le téléchargement des médias.                     |
| 5   | Moyenne          | Les garde-fous de Numa laissaient passer des formulations courantes (« vous pouvez lui donner un demi-comprimé », « 250 milligrammes », « vous pouvez arrêter les antibiotiques », « cela ressemble à une infection »). | Hors simples nouvelles, Numa envoie un texte fixe validé, jamais celui du modèle ; règles élargies et testées sur ces phrases. |
| 6   | Faible à moyenne | Un vétérinaire qui voit le brouillon d'un confrère pouvait s'en déclarer responsable et le lancer dans la même requête.                                                                                                 | Deux requêtes distinctes ; réattribution réservée à l'équipe qui prépare, au responsable et à l'administrateur ; journalisée.  |
| 7   | Faible           | Effacer les cookies de session ne marchait pas en HTTPS (cookie `__Host-` effacé sans `Secure`).                                                                                                                        | Effacement avec les mêmes attributs.                                                                                           |
| 8   | Faible           | Les appareils de confiance survivaient à une réinitialisation du mot de passe.                                                                                                                                          | Retirés par la réinitialisation (migration 0020).                                                                              |
| 9   | Faible           | Cinq essais faux depuis n'importe où bloquaient le vétérinaire même sur son poste habituel.                                                                                                                             | Compteur séparé pour un appareil de confiance.                                                                                 |
| 10  | Faible           | Les pages internes (système de design) étaient servies en staging.                                                                                                                                                      | Servies sur le poste local seulement.                                                                                          |
| 11  | Faible           | Les photos gardaient leurs métadonnées (position GPS, appareil).                                                                                                                                                        | EXIF, XMP, IPTC et commentaires retirés avant le dépôt.                                                                        |

## À vérifier en staging (partie B)

- **Adresse IP du client** : `src/server/auth/origin.ts` prend la dernière valeur de `X-Forwarded-For`. C'est juste si l'entrée HTTPS de Scaleway est le seul relais qui l'écrit. À contrôler sur une vraie requête : sinon toutes les connexions partageraient une seule limite par IP.
- **`APP_ENV`** vaut `local` par défaut. Terraform le fixe pour le staging et la production. Depuis le 20 octobre 2026, le mode `local` n'est accepté que si `APP_URL` désigne le poste local (`localhost`, `127.0.0.1`, `[::1]`, `*.localhost`) : une image lancée en ligne sans `APP_ENV` refuse de démarrer au lieu de garder des cookies non `Secure`. Reste à vérifier la valeur dans la configuration des conteneurs avant tout trafic.

## Vérifié et conforme

- **Mots de passe** : Argon2id (19 Mio, 2 passes) ; vérification factice pour une adresse inconnue ; même message pour adresse inconnue, mauvais mot de passe ou compte sans cabinet.
- **Jetons** (session, code, réinitialisation, invitation, appareil) : 256 bits aléatoires, seule l'empreinte SHA-256 est stockée, usage unique, expiration côté serveur.
- **Sessions** : nouveau jeton à chaque connexion, 12 h au plus, verrouillage à 40 min contrôlé en base, fermeture à la déconnexion, à la réinitialisation, au retrait du cabinet. Le rôle est relu en base à chaque requête.
- **Cookies** : `HttpOnly`, `SameSite=Lax`, `Secure` et préfixe `__Host-` hors poste local.
- **CSRF et redirections** : toutes les modifications passent par des Server Actions (contrôle d'origine de Next) ; redirections fixes ou limitées à des chemins internes.
- **En-têtes** : CSP avec nonce par requête et `strict-dynamic`, sans `unsafe-inline` pour les scripts ; HSTS 2 ans ; `frame-ancestors 'none'` ; `nosniff` ; COOP/CORP ; Permissions-Policy.
- **Isolation entre cabinets** : les 57 tables ont la sécurité par ligne activée et forcée ; rôle applicatif sans `BYPASSRLS` ; cabinet fixé par transaction, toujours depuis la session ou une fonction de routage, jamais depuis le navigateur ; fonctions `SECURITY DEFINER` avec `search_path` fixé et entrées contrôlées.
- **Droits** : chaque action serveur relit la session et les permissions, valide ses entrées avec Zod et vérifie l'appartenance de chaque identifiant au cabinet (pas d'IDOR).
- **Fichiers** : type lu dans le contenu (ni SVG, ni HTML, ni PDF), tailles bornées, clés d'objet construites par le serveur, liens signés de 2 minutes liés au membre, servis avec `sandbox`, `nosniff` et `no-store`.
- **Webhooks** : signature HMAC vérifiée en temps constant sur le corps brut, fenêtre de 5 minutes pour Stripe, événements dédoublonnés en base, réponses sans contenu.
- **Appels sortants** : médias WhatsApp limités aux domaines de Meta, en HTTPS, sans redirection ; adresse de la passerelle IA fixée par la configuration.
- **XSS et injection SQL** : aucun HTML injecté dans les pages ; e-mails échappés ; requêtes SQL toutes paramétrées.
- **Journaux** : ni numéro, ni e-mail, ni jeton, ni contenu clinique ; empreinte tronquée de l'IP seulement.
- **Dépendances** : `pnpm audit --prod` sans vulnérabilité connue (une alerte élevée sur `braces`, outil de développement seulement, absent de l'application).

## Reste prévu

Le test d'intrusion externe par un prestataire, avant le premier vrai dossier (cahier des charges §19).
