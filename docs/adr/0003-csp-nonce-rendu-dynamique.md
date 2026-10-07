# 0003 — CSP stricte avec nonce et rendu à la requête

- Statut : accepté (7 octobre 2026)

## Décision

Chaque réponse HTML porte une Content-Security-Policy sans domaine tiers, avec un nonce unique par requête (`src/proxy.ts`, `src/server/security/csp.ts`). Les scripts et balises `<style>` sans nonce sont refusés ; `unsafe-eval` n'existe qu'en développement.

Conséquences assumées :

1. **Pas de pré-rendu statique** (`cacheComponents` désactivé, `connection()` dans le layout racine). Un HTML pré-rendu au build ne peut pas porter le nonce de la requête : le test e2e « aucun script ne viole la CSP » l'a démontré. Pour un logiciel métier qui manipule des données cliniques, le rendu à la requête est de toute façon la norme.
2. **`style-src-attr 'unsafe-inline'`** : seuls les attributs `style="…"` (posés par React et `next/image`) sont tolérés. Ils ne peuvent pas exécuter de script ; les balises `<style>` restent soumises au nonce.

## À revoir

Le site public pourra être pré-rendu plus tard avec une CSP à empreintes (hash) si les performances l'exigent.
