# 0028 — Infrastructure Scaleway, e-mails, stockage et réveil du worker

- Statut : accepté (9 octobre 2026)

## Contexte

Phase 3, lot 26. L'architecture technique place tout à Paris chez Scaleway : conteneurs, PostgreSQL managé, stockage objet, Scaleway Queues, e-mails transactionnels. Jusqu'ici, l'application ne savait parler qu'à Mailpit et à un dossier local. Le plan impose de décrire le staging en code sans rien créer avant le feu vert d'Aaron.

## Décision

1. **Infrastructure en Terraform** (`infra/scaleway/`) : réseau privé, PostgreSQL 16 sans adresse publique (chiffré, sauvegarde quotidienne gardée 14 jours), bucket privé versionné, Scaleway Queues, Transactional Email, registre d'images privé, conteneurs `app` (public, HTTPS imposé) et `worker` (privé). Les secrets arrivent au moment de l'application, jamais dans le dépôt ; l'état Terraform vit dans un bucket privé.
2. **E-mails** : `EMAIL_PROVIDER=smtp` (Mailpit, local seulement) ou `scaleway` (Transactional Email, région Paris). Une erreur d'envoi ne porte qu'un code HTTP, jamais l'adresse ou le contenu.
3. **Stockage objet** : `STORAGE_PROVIDER=local` (local seulement) ou `scaleway` (API compatible S3, signature AWS v4). Écriture conditionnelle (`If-None-Match: *`) : un objet n'est jamais écrasé.
4. **File de tâches** : PostgreSQL reste la seule source de vérité des tâches (ADR 0014 : transactions, idempotence, « Tâches en échec »). Scaleway Queues ne transporte qu'un **signal de réveil** sans donnée : l'application le dépose après la validation d'une transaction qui a inscrit une tâche, et le worker l'attend au lieu de dormir. Une file injoignable ne perd rien : le worker retombe sur son attente fixe.
5. **Coupure franche**, comme pour WhatsApp, l'IA et Stripe : chaque fournisseur réel exige toutes ses clés ; Mailpit et le dossier local sont refusés hors du poste local. Une erreur de configuration cite des noms de variables, jamais des valeurs.

## Conséquences

- Tests sans compte ni réseau : vecteur officiel de la signature AWS v4, imitations de la file et du bucket, réveil seulement après validation (ni après annulation, ni sur une tâche rejouée).
- Les appels réels (protocole JSON de l'API SQS, écriture conditionnelle S3, en-têtes de Transactional Email) sont à confirmer en mode test pendant la partie B.
- Une tâche planifiée Serverless Jobs, en filet de sécurité du worker, viendra quand ses secrets pourront être lus depuis le gestionnaire de secrets plutôt que posés en clair dans sa définition.
- Partie B : projet Scaleway au nom d'Aaron, acceptation des conditions de Transactional Email, domaine d'envoi vérifié, puis `terraform plan` relu avant tout `apply`.
