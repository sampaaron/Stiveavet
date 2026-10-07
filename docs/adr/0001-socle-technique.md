# 0001 — Socle technique

- Statut : accepté (7 octobre 2026)

## Décision

Une seule application Next.js 16 (App Router) en TypeScript strict, Tailwind CSS 4, empaquetée en image Docker `standalone` exécutée sans root. Gestionnaire de paquets pnpm, Node 22 LTS.

Outillage : ESLint (`no-explicit-any` en erreur), Prettier, Vitest pour les tests unitaires et d'intégration, Playwright + axe-core pour les tests de bout en bout et d'accessibilité. Environnement local via Docker Compose : application, PostgreSQL 16, Mailpit.

## Raisons

Conforme à `ARCHITECTURE_TECHNIQUE_STRIVEA.md` §1 et §5 : un dépôt, une application, des migrations versionnées, une CI qui bloque toute régression.

## Conséquences

- Aucun service externe en local : les e-mails sont capturés par Mailpit, les connecteurs sont simulés.
- La police Plus Jakarta Sans est auto-hébergée (`@fontsource-variable`) : aucune requête vers Google, compatible avec la CSP stricte.
