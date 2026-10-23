# 0039 — Sécurité des comptes et des invitations (audit du 23 octobre 2026)

- Statut : accepté (23 octobre 2026)
- Complète les ADR 0007, 0008 et 0036

## Contexte

L'audit de sécurité du 23 octobre 2026 n'a trouvé aucun point critique ni élevé, mais deux points moyens (invitations détournables pour envoyer des e-mails, invitations d'un membre parti encore valables) et plusieurs points faibles : pas d'écran pour changer son mot de passe ou voir ses sessions, sessions d'un membre retiré revenant avec son accès, mot de passe de réinitialisation non comparé au nom du titulaire, liste de mots de passe courants trop courte, garde-fous de Numa sans contrôle des liens et numéros, étiquette AES-GCM de longueur non imposée, empreintes d'IP et d'e-mails réversibles. Migration 0027.

## Décision

1. **Invitations.** Le nom de la personne invitée et le nom du cabinet saisi à l'inscription suivent la règle du nom de cabinet de la démo (ADR 0036) : ni lien, ni adresse, ni caractère invisible. Un cabinet envoie au plus 20 invitations en 24 heures, annulées comprises (compteur `auth.hit_rate_limit`, pris dans la transaction de l'invitation). Aucune invitation ne part vers une adresse déjà inscrite (`email_registered`) : un compte n'appartient qu'à un cabinet pour l'instant. Un administrateur apprend donc qu'une adresse a un compte Stivea Vet ; c'est déjà le cas sur la page d'invitation, et le plafond quotidien borne ce sondage.
2. **Départ d'un membre.** Ses invitations en attente sont annulées dans la même transaction (journal `invitation.revoked`, raison `member_deactivated`) et une invitation dont l'auteur n'est plus membre actif ne s'accepte plus, même créée avant ce changement. Ses sessions sont fermées par `auth.revoke_membership_sessions`, limitée au cabinet courant et à un membre déjà retiré : rétablir l'accès ne les rouvre pas.
3. **« Sécurité du compte »** (`/app/compte`, ouvert à tout membre, depuis l'icône de bouclier du compte). Changer son mot de passe exige l'ancien (5 erreurs en 15 minutes ferment la session : une session volée ne sert pas à le deviner) et applique les règles de l'inscription, plus « différent de l'actuel ». Les autres sessions, les liens de réinitialisation et les codes en cours tombent ; un e-mail sans lien prévient la personne ; le journal d'activité garde `account.password_changed`. La page liste les sessions ouvertes et les appareils de confiance avec un libellé court (« Firefox · Windows », sans version) gardé à la connexion ; « Déconnecter les autres appareils » et « Retirer » un appareil sont journalisés (`account.sessions_revoked`, `account.device_revoked`). Toutes ces fonctions SQL partent du jeton de la session courante, déverrouillée, jamais d'un identifiant choisi par l'application.
4. **Mots de passe.** La réinitialisation refuse un mot de passe qui contient l'adresse ou le nom du titulaire du lien (`auth.password_reset_owner`). La liste des mots de passe courants compte 15 717 racines (`mots-de-passe-courants.ts`, chargé une fois) : les 10 000 mots de passe les plus courants et les 20 000 premiers de la liste du NCSC britannique (SecLists, licence MIT), plus des prénoms, mots, villes, clubs, noms d'animaux, termes du métier et motifs AZERTY français, avec leurs combinaisons fréquentes. Le générateur (`mots-de-passe-courants.generer.mts`) est déterministe. La comparaison porte sur une racine normalisée (sans accents, chiffres et symboles en bordure, séparateurs ni « leet ») ; les suites de touches et les racines répétées sont refusées aussi.
5. **Empreintes à clé.** Les clés des compteurs et l'empreinte d'IP du journal de connexion sont des HMAC-SHA256 avec `FINGERPRINT_SECRET` (32 caractères au moins, gestionnaire de secrets), validée par Zod au démarrage et obligatoire hors local. En local seulement, une clé fixe est dérivée.
6. **Numa** refuse, en plus, tout lien, nom de domaine, adresse e-mail, suite de 6 chiffres ou plus (même espacés) et toute phrase où elle se dirait vétérinaire ou docteur, en français et en anglais (raison `content`). Elle reste présentée comme une IA et ne donne jamais un contact que le cabinet n'a pas validé.
7. **Divers.** Chiffrement des secrets : étiquette GCM de 16 octets et vecteur de 12 octets imposés à l'ouverture. Les places de vétérinaires et d'assistants se comptent sous verrou consultatif du cabinet (`lockSeats`). Les erreurs de base se lisent par `pgErrorCode` et `isUniqueViolation` ; l'équipe ne traduit plus un refus qu'à partir du nom de sa contrainte (`memberships_keep_one_admin`) et relance tout autre refus 23514.

## Différé

- **Inscription en attente (F7).** Une inscription non confirmée réserve encore l'adresse d'un tiers jusqu'au code. La corriger demande un compte « en attente » activé au premier code et purgé après 24 heures, ce qui touche l'inscription, les invitations, la connexion et la conservation : chantier à part, à décider avant le premier vrai cabinet.
- **Changement d'offre** (facturation) : il compte les places sans prendre `lockSeats` ; à aligner dans ce domaine.

## Conséquences

- `FINGERPRINT_SECRET` doit être ajoutée au gestionnaire de secrets du staging avant le prochain déploiement, sinon l'application refuse de démarrer. Changer la clé remet les compteurs à zéro, sans autre effet.
- Les brouillons de Stive, signés par le vétérinaire (« c'est Dr … »), ne passent pas les garde-fous de Numa ; ils ne leur ont jamais été soumis en production.
- Retirer un appareil de confiance n'ouvre ni ne ferme de session : il impose seulement le code à la prochaine connexion sur cet appareil.

## Mon compte (23 octobre 2026)

À la demande d'Aaron, la carte d'identité en bas de la barre latérale mène à « Mon compte » (`/app/compte`), qui remplace « Sécurité du compte » et reprend ses trois réglages (mot de passe, sessions, appareils de confiance).

- La page montre à la seule personne connectée : son e-mail de connexion, son cabinet, son rôle, la formule, son numéro d'alertes urgentes, sa langue, sa date d'arrivée, ses suivis par statut (hors suivis test), ses demandes à Stive du mois et la liste de ses droits.
- Tout est lu sous RLS par l'adhésion de la session (`accountOverview`) : aucune donnée d'un autre membre, aucun contenu clinique. Une adhésion d'un autre cabinet glissée dans le contexte ne renvoie rien (test d'intégration `compte.test.ts`).
- Rien n'y est modifiable hormis la sécurité : le nom, l'e-mail et le rôle restent gérés par l'administrateur (« Équipe et droits »).
