# 0012 — Site public bilingue, démo en lecture seule et séquence d'e-mails

- Statut : accepté (7 octobre 2026)

## Contexte

Cahier des charges §14 : site public en français et en anglais (accueil, fonctionnement, Numa, Stive, intégrations, tarifs, sécurité, centre d'aide, statut, connexion, essai, démo, conditions, confidentialité), appel principal « Commencer l'essai à 86 € HT », acceptation des conditions et confirmation du pouvoir de souscrire, arrivée directe dans l'installation guidée. §13 : démo très limitée sur fausses données après collecte de l'e-mail, du nom du cabinet et du nombre de vétérinaires, puis cinq e-mails sur deux semaines, arrêtés dès le démarrage de l'essai, désinscription à tout moment. Architecture §10 : e-mails commerciaux séparés, désinscriptibles, sans donnée clinique. §19 : conditions et confidentialité à faire valider par un juriste. Le plan prévoyait next-intl.

## Décision

1. **Dictionnaires typés plutôt que next-intl.** Les textes du site sont dans `src/i18n/site/fr.ts` (référence) et `en.ts`, dont le type est dérivé du français : une clé manquante est une erreur de compilation ; un test vérifie la même structure (listes comprises) et les mêmes valeurs à remplacer. Aucune dépendance ni intergiciel supplémentaire, rien à combiner avec le proxy qui pose le nonce CSP (ADR 0003). C'est le schéma recommandé par la documentation de Next.js.
2. **Adresses** : `/fr/…` et `/en/…`, chacune avec ses propres mots (`/fr/tarifs`, `/en/pricing`), toutes produites par `src/i18n/routes.ts`. `/` redirige selon `Accept-Language` (français par défaut). Le proxy pose `x-stivea-locale` d'après l'adresse, toujours réécrit, pour `<html lang>`. Le lien de langue mène à la même page dans l'autre langue.
3. **Contenu** : prix et règles lus dans le catalogue de facturation (`rules.ts`), jamais recopiés ; dr.veto et WhatsApp Business « au lancement », Vétocom et Vetup « bientôt disponibles » ; aucune promesse chiffrée, aucun témoignage inventé ; la page Statut n'affiche aucun état « opérationnel » tant que le service n'est pas ouvert ; conditions et confidentialité portent un bandeau « projet à faire valider par un juriste ». Portraits de Numa et Stive toujours accompagnés de « Assistante IA » / « Assistant IA ».
4. **Inscription** : deux cases distinctes, jamais pré-cochées et exigées par le serveur (conditions ; pouvoir de souscrire au nom du cabinet). La version des conditions et ces deux confirmations sont consignées dans le journal d'activité (`organization.created`). Après le code e-mail, l'inscription mène à `/app/demarrage`.
5. **Prospects isolés** dans un schéma `marketing` : le rôle applicatif n'a aucun droit sur ses tables et passe par des fonctions `SECURITY DEFINER` limitées (enregistrer, ouvrir la démo, désinscrire, réserver et marquer un envoi, purger). Jetons d'accès et de désinscription stockés en empreinte SHA-256 uniquement. Horloge de la base : l'application ne peut ni avancer la séquence, ni prolonger un accès, ni purger un prospect récent. Conservation : un an.
6. **Démo** : cookie `httpOnly` de 14 jours (`__Host-` en HTTPS) ; la page n'affiche que les données fictives du cabinet des Tilleuls (`src/fixtures`), sans session, sans accès aux tables des cabinets, sans formulaire ni action. Le lien du premier e-mail ouvre la démo dans un autre navigateur, puis redirige vers une adresse sans jeton.
7. **Séquence** : jours 0, 2, 5, 9 et 13 ; un e-mail au plus par étape (réservé avant l'envoi, libéré en cas d'échec) et par passage, au moins 20 heures entre deux. Arrêt dès qu'un compte existe pour l'adresse (l'essai a démarré), à la désinscription, ou 30 jours après la demande. Une nouvelle demande renouvelle l'accès sans relancer la séquence ni annuler une désinscription. Désinscription par une page à confirmer, ou en un clic par la messagerie (`List-Unsubscribe`, POST uniquement, RFC 8058). Expéditeur commercial distinct de l'expéditeur de service ; Mailpit uniquement. Sans tâche de fond en phase 1, `pnpm demo:emails` envoie ce qui est dû.
8. **Limite** : 10 demandes de démo par heure et par adresse IP (derrière le répartiteur de confiance).

## Conséquences

- L'interface du logiciel reste en français : la version anglaise de l'espace cabinet est à faire (le site anglais le dit). Les dictionnaires pourront être étendus à l'application avec le même mécanisme.
- Les textes juridiques, les modalités d'exercice des droits et la base légale des e-mails de prospection sont à valider par un juriste avant l'ouverture.
- Un vrai fournisseur d'e-mail commercial (domaine, SPF/DKIM, gestion des rebonds) et une tâche planifiée remplaceront Mailpit et le script, sur décision explicite.
- Le site public reste rendu à la requête (nonce CSP) ; il pourra être mis en cache en périphérie si besoin.
