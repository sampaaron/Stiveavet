# 0053 — Bandeau et politique de cookies

- Statut : accepté (29 octobre 2026), demande d'Aaron : « fais la demande de cookies quand on entre sur le site »
- Suit les recommandations de la CNIL sur les cookies (article 82 de la loi Informatique et libertés)

## Contexte

Stivea Vet ne dépose aujourd'hui que des cookies nécessaires : session, appareil reconnu, code de sécurité, accès à la démo, langue, mode d'affichage. Ces cookies sont exemptés de consentement. Aucun outil de mesure d'audience ni de publicité n'est branché. Aaron veut pourtant une demande claire dès l'arrivée, prête pour le jour où de tels outils arriveront.

## Décision

1. **Un bandeau à la première visite**, sur toutes les pages (site, connexion, espace cabinet). Il revient au bout de six mois, durée de validité recommandée par la CNIL.
   - Il propose « Tout refuser » et « Tout accepter », de même forme et de même poids, ainsi que « Personnaliser ».
   - Il ne bloque pas la page : sans réponse, seuls les cookies nécessaires sont déposés.
   - Il garde les couleurs du site (nuit verte) quel que soit le mode d'affichage.
2. **Deux finalités facultatives, refusées par défaut** : mesure d'audience et marketing.
   - Le bandeau dit honnêtement qu'aucun outil n'y est branché aujourd'hui : rien n'est déposé, même avec un accord.
   - Les finalités sont listées à un seul endroit (`src/domains/consentement/cookies.ts`).
   - Changer cette liste demande un nouveau choix : `CONSENT_VERSION` augmente et le bandeau revient pour tous.
3. **Le choix reste dans le navigateur** : cookie `sv_consent` (`__Host-` en HTTPS), httpOnly, six mois.
   - Il ne contient que la version, les deux réponses et la date, sans rien d'identifiant.
   - Un cookie illisible, d'une autre version ou daté de plus de six mois vaut absence de choix.
   - Le formulaire passe par une action serveur validée par Zod et fonctionne sans JavaScript.
4. **Une page « Politique de cookies »** (`/fr/cookies`, `/en/cookies`), liée au pied de page du site (« Gérer les cookies ») et au bandeau.
   - Elle liste chaque cookie réellement déposé, avec son nom, à quoi il sert et sa durée.
   - Elle permet de changer son choix à tout moment.

## Conséquences

- Avant de brancher un outil de mesure d'audience ou de publicité, il faut :
  - le charger seulement si `currentConsent()` l'autorise ;
  - l'ajouter à la liste des cookies de la politique ;
  - prévoir une preuve du consentement côté serveur, sans donnée identifiante ;
  - faire relire le texte par le juriste, comme les autres pages légales.
- Les tests de bout en bout jouent une personne qui a déjà répondu, avec « Tout refuser » posé par `tests/e2e/support/test.ts`. Le bandeau a ses propres tests dans `cookies.spec.ts`.
