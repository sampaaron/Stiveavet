# Domaines métier

Un dossier par domaine (`ARCHITECTURE_TECHNIQUE_STRIVEA.md` §5) : `auth`, `cabinet`, `suivis`, `protocoles`, `agenda`, `facturation`, `notifications`, `audit`, `stive`, `whatsapp`, `integrations`, plus `conversations` (fils, messages, pièces jointes), `urgences` (triage, alertes) et `taches` (file de tâches).

Chaque domaine contient, au fur et à mesure des lots :

- `schema.ts` : tables Drizzle du domaine ;
- `validators.ts` : schémas Zod des entrées ;
- `policies.ts` : règles d'accès (rôle, permission, responsable, partage, dossier privé) ;
- `service.ts` : cas d'usage, seuls points d'entrée appelés par l'interface et les routes ;
- `*.test.ts` à côté du code testé.

Un domaine n'importe jamais l'implémentation interne d'un autre : il passe par son `service.ts`.
