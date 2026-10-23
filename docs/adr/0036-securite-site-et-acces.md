# 0036 — Sécurité du site et des accès (revue du 20 octobre 2026)

- Statut : accepté (20 octobre 2026)
- Complète l'ADR 0007 (§8) et l'ADR 0029 (§2) ; complétée par l'ADR 0039 (audit du 23 octobre 2026)

## Contexte

Aaron a demandé de sécuriser le site et les accès. Une revue a relu la connexion, les sessions, les droits, les 51 actions serveur, les routes publiques, les webhooks et les en-têtes. Elle n'a trouvé aucun point critique ni élevé. Le contrôle d'accès de l'espace cabinet tient : chaque action exige une session déverrouillée, relit les droits en base et valide ses entrées ; aucun accès ne contourne l'isolation entre cabinets. Les points ci-dessous changent.

## Décision

1. **Plus de blocage d'un compte à distance.** Les échecs de connexion sont comptés par compte et par lieu : l'appareil de confiance, sinon l'adresse IP (5 échecs en 15 minutes). Des essais venus d'ailleurs ne bloquent donc plus une assistante, qui n'a jamais d'appareil de confiance, ni un vétérinaire sur un poste neuf. Un plafond par compte, toutes adresses confondues (25 échecs en 15 minutes, hors appareil de confiance), freine les essais répartis sur plusieurs adresses. Sans adresse IP connue (poste local), le compteur reste celui du compte seul.
2. **Nouveau mot de passe depuis un lien.** Le lien est vérifié avant le calcul coûteux du mot de passe (Argon2id), et les envois sont limités à 20 par adresse IP et par heure : la page ne peut plus servir à épuiser le serveur.
3. **Démo : adresse confirmée avant la séquence.** Le premier e-mail porte un lien qui lui est propre, jamais remis au navigateur qui a fait la demande. Les quatre e-mails suivants ne partent qu'après un clic sur ce lien (migration 0025). Une demande faite avec l'adresse d'un tiers ne lui envoie donc qu'un seul e-mail. Le nom du cabinet saisi n'apparaît plus dans les e-mails et refuse liens, adresses et caractères invisibles. Le premier e-mail part après la réponse, si bien que sa durée ne révèle plus si l'adresse a déjà demandé une démo, et une nouvelle demande ne coupe plus le lien reçu par la vraie adresse.
4. **Erreurs de base sans données.** Drizzle met les paramètres d'une requête dans le message d'erreur, et PostgreSQL met les valeurs refusées dans son détail : une panne ou un caractère nul pouvait écrire un e-mail ou du contenu clinique dans les journaux. Les transactions des cabinets, l'authentification et la démo relancent désormais une erreur réduite au code, à la contrainte et au message de PostgreSQL (vidé pour les erreurs de données, classe 22). Le caractère nul est retiré des champs de formulaire.
5. **Historique de Stive selon les droits du moment.** Une ancienne réponse ne montre plus l'agenda, les créneaux ou les rendez-vous sans le droit de lecture de l'agenda, les alertes sans accès clinique, ni les fiches à finir sans le droit de lancer un suivi (ADR 0008 : un droit retiré s'applique aussitôt).
6. **CSP sur toutes les pages**, préchargements compris : aucune réponse HTML ne part sans sa politique, et la langue n'est jamais reprise d'un en-tête du navigateur.
7. **Réglages** : la permission est vérifiée avant tout appel à un prestataire (mandat de prélèvement).
8. **Politique de sécurité réelle** (`SECURITY.md`) : signalement privé par GitHub, délais de réponse, données fictives seulement.

## Points gardés tels quels

- **Taille des actions serveur** : la limite de 6 Mo vaut pour toutes les actions, y compris publiques, parce que photos et captures passent par des actions. Le répartiteur de charge devra limiter la taille des requêtes et leur nombre par adresse avant la mise en ligne.
- **Statistiques du tableau de bord** : le nombre d'alertes du cabinet et le délai médian d'accusé de réception restent visibles de toute l'équipe, comme le prévoit le cahier des charges (§12). Ce sont des totaux, sans dossier ni animal.
- **Image du worker** : elle garde le code source et les outils de construction, car le worker est exécuté par `tsx`. Elle n'est jamais exposée sur le réseau.

## Conséquences

- Un attaquant qui veut deviner un mot de passe a 25 essais par compte et par quart d'heure au plus, contre 5 jusqu'ici ; le mot de passe reste long (12 caractères), hors liste des mots de passe courants (étendue à plus de 15 000 racines par l'ADR 0039) et haché avec Argon2id.
- Un prospect qui n'ouvre jamais le lien du premier e-mail ne reçoit pas la suite.
- Le test d'intrusion externe reste prévu avant le premier vrai cabinet (cahier des charges §19).
