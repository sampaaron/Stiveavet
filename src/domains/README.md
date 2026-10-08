# Domaines métier

Un dossier par domaine : `agenda`, `audit`, `auth`, `cabinet`, `conversations`, `demo`, `equipe`,
`facturation`, `fichiers`, `notifications`, `protocoles`, `reglages`, `suivis`, `taches`,
`urgences`, `whatsapp`. `commun.ts` regroupe quelques utilitaires sans dépendance (texte, heures).

Dans un domaine :

- `schema.ts` : tables Drizzle du domaine (le SQL des migrations fait foi) ;
- `service.ts` (ou un fichier nommé d'après le cas d'usage, comme `suivis/lancement.ts`) : les
  points d'entrée appelés par l'interface, les routes et le worker. Chacun vérifie la permission,
  ouvre sa transaction avec `tenantRunner` ou `withTenant` et écrit au journal d'audit ;
- le reste (règles pures, textes, validations Zod, e-mails) est interne au domaine ;
- `*.test.ts` à côté du code testé.

Un domaine passe par le service d'un autre plutôt que par ses détails internes. Exceptions
assumées : `equipe/actor.ts` (acteur, permissions, `DomainError`), `audit/journal.ts` et les
`schema.ts`, partagés par tous. Le trajet complet d'une action est décrit dans
`docs/DEVELOPPEMENT.md`.
