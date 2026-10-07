# 0007 — Authentification maison : sessions en base, code e-mail, verrouillage serveur

- Statut : accepté (7 octobre 2026)

## Contexte

Architecture §8 et cahier des charges « Sécurité » : mot de passe robuste haché ; code de sécurité par e-mail pour les vétérinaires lors d'une nouvelle connexion ; mot de passe seul et droits limités pour les assistants ; verrouillage après 40 minutes d'inactivité, déverrouillage par mot de passe ; réinitialisation par jeton court à usage unique ; limitation des tentatives et journal de connexion. Aucun service externe n'est autorisé à ce stade.

## Décision

1. **Mots de passe** : Argon2id (19 Mio, 2 passes, paramètres OWASP). 12 caractères minimum, refus des mots de passe courants (liste embarquée, comparée sur la forme normalisée) et de ceux qui contiennent le nom ou l'e-mail. Une vérification est toujours faite, même pour une adresse inconnue, pour ne pas révéler l'existence d'un compte par le temps de réponse.
2. **Schéma `auth` cloisonné** : mots de passe, sessions, codes, appareils de confiance, liens de réinitialisation et compteurs vivent dans un schéma où le rôle applicatif n'a **aucun** droit. Il n'y accède que par des fonctions `SECURITY DEFINER` (une par opération, `search_path` figé). Jetons et codes ne sont stockés que sous forme d'empreinte SHA-256.
3. **Sessions en base** : jeton aléatoire de 256 bits en cookie `httpOnly`, `SameSite=Lax`, `Secure` et préfixe `__Host-` dès que l'application est en HTTPS (imposé hors local). Durée maximale 12 h. Une session est refusée dès que le compte est désactivé ou l'appartenance au cabinet retirée.
4. **Verrouillage à 40 minutes contrôlé par la base** : chaque requête passe par `auth.resolve_session`, qui verrouille la session si la dernière activité date de plus de 40 minutes et ne la prolonge jamais une fois verrouillée. Le navigateur verrouille aussi l'écran à l'échéance et signale l'activité locale (saisie longue) au plus toutes les 5 minutes. Cinq échecs de déverrouillage ferment la session.
5. **Code de sécurité** : 6 chiffres, 10 minutes, usage unique, 5 essais, un seul code valide à la fois, lié à un jeton de défi en cookie. Un code valide reconnaît l'appareil pour 90 jours (cookie dédié, propre à la personne). Le code est demandé à tout membre ayant un rôle vétérinaire.
6. **Inscription** : crée le cabinet et son vétérinaire administrateur ; aucune session n'est ouverte avant le code e-mail, qui prouve l'adresse. Une adresse déjà enregistrée suit exactement le même parcours à l'écran et reçoit un e-mail d'information.
7. **Réinitialisation** : lien de 30 minutes, usage unique, un seul lien valide à la fois. Le changement ferme toutes les sessions et prévient la personne par e-mail. La réponse à la demande est identique que le compte existe ou non.
8. **Limitation des tentatives** : 5 échecs de connexion par compte en 15 minutes (seuls les échecs comptent), 30 tentatives par IP en 15 minutes, 3 demandes de réinitialisation par compte et 10 par IP par heure, 5 inscriptions par IP par heure. L'IP n'est lue que derrière un répartiteur de confiance (`TRUST_PROXY`, obligatoire hors local) ; les clés de compteur sont des empreintes.
9. **Journal de connexion** (`login_events`) : ajout seul, écrit par les fonctions `auth`, lisible par le cabinet concerné. Aucun e-mail ni IP en clair (empreinte tronquée de l'IP, navigateur tronqué).
10. **CSRF** : les mutations sont des actions serveur Next.js (POST uniquement, contrôle `Origin`/`Host`), avec cookies `SameSite=Lax`.
11. **E-mails** : interface `EmailSender` ; en local et en CI, Mailpit capture tout. Aucun prestataire réel tant qu'Aaron ne l'a pas décidé (ADR 0004).

## Conséquences

- Les tests d'intégration couvrent chaque règle ci-dessus contre PostgreSQL ; les parcours (inscription, code, verrouillage, déconnexion, mot de passe oublié) sont testés de bout en bout avec Mailpit, à 1280 et 320 px.
- Le tableau de bord et le dossier de référence (données fictives du lot 2) ne s'affichent que pour le cabinet des Tilleuls ; tout autre cabinet voit un tableau de bord vide, en attendant la lecture des suivis en base.
- Le choix du cabinet pour une personne membre de plusieurs cabinets n'existe pas encore : la session ouvre le plus ancien. Les invitations (personnes sans mot de passe) arrivent au lot 5.
