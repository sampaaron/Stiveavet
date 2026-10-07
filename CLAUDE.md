# Stivea Vet — règles pour Claude

Lire `AGENTS.md` (Next.js 16 : consulter `node_modules/next/dist/docs/` avant d'écrire du code Next).

## Règles fixées par Aaron

- Répondre en français. Rigueur production, sécurité, UX premium, code maintenable.
- Sources de vérité : cahier des charges (produit) et architecture technique ; la référence visuelle ne sert qu'au design et ne prime jamais.
- Marque : **Stivea Vet** (pas « Strivea »), voir `docs/adr/0002-marque-stivea-vet.md`.
- Données fictives uniquement. Aucun déploiement, compte externe, clé secrète, WhatsApp, dr.veto, Stripe ou IA réelle.
- Ne jamais simplifier la sécurité, l'isolation entre cabinets, les rôles, l'audit, le consentement ou la gestion des données.
- Numa et Stive ne prennent jamais de décision médicale et sont toujours présentés comme des IA.
- Plan d'abord ; respecter les points d'arrêt de validation du plan de la phase 1.

## Code

- TypeScript strict, aucun `any`. Toute entrée serveur validée avec Zod.
- Aucun contenu clinique, numéro, e-mail, jeton ou mot de passe dans les logs ou les messages d'erreur.
- Décisions d'architecture dans `docs/adr/`.
- Avant de pousser : `pnpm check`, `pnpm build`, `pnpm test:e2e`.
