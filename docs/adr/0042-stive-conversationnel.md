# 0042 — Stive conversationnel

- Statut : accepté (23 octobre 2026), à la demande d'Aaron : « stive va être un réel assistant du vétérinaire »
- Complète l'ADR 0034 (Stive, l'assistant IA de l'équipe) et s'appuie sur la passerelle de l'ADR 0026.

## Contexte

Stive ne reconnaissait que six demandes, par des règles écrites, et répondait « je ne sais pas encore faire ça » au reste. Aaron veut qu'un vétérinaire puisse discuter normalement avec lui, comme avec une IA conversationnelle centrée sur le métier et tout ce qui l'entoure : organisation, suivi post-opératoire, et surtout la prise en charge des clients (communication, accompagnement, que faire avec eux).

Rien ne change aux règles du cahier des charges : Stive est une IA, ne prend aucune décision médicale, n'agit jamais sans confirmation, ses échanges restent privés et la limite mensuelle s'applique.

## Décision

1. **Conversation libre et multi-tours** dans l'écran de Stive. L'historique reste celui de l'ADR 0034 : 30 jours, privé à son auteur (RLS `own_stive`), filtré à chaque lecture par les accès du moment. Une réponse libre est gardée comme une réponse de plus (`kind: "reply"`) ; les cartes et brouillons existants s'affichent sous elle.
2. **Vraie IA par la passerelle** : méthode `stiveChat` d'`AiGateway`, un seul appel « chat completions » avec appel d'outils au format compatible OpenAI et Mistral (`api-compatible.ts`). La boucle reste côté Stivea Vet (`domains/stive/agent.ts`).
   - **Outils** (`domains/stive/outils.ts`) : les six demandes (point du jour, résumé d'un dossier, créneaux libres, rendez-vous demandés, brouillon, pause/reprise/arrêt), plus `chercher_suivis` (suivis auxquels la personne a accès).
   - Le serveur exécute chaque outil **avec les droits de la personne**, par les mêmes fonctions que les demandes reconnues par règles : isolation par cabinet (RLS), rôles, accès clinique ou d'organisation, dossiers privés. Une lecture de dossier est tracée `followup.viewed` (`via: "stive"`).
   - Les arguments du modèle sont relus par Zod. Un suivi est désigné par une référence courte propre au tour (« S1 »), tirée de la liste des suivis visibles : le modèle ne peut ni voir ni désigner un identifiant interne, ni un dossier hors de cette liste.
   - Stive n'a toujours **aucun chemin d'écriture** : une action est une carte « À confirmer », un brouillon ne part qu'au clic sur Envoyer.
3. **Sans clé (mode simulé, poste local)** : la passerelle simulée ne converse pas. Stive garde ses six demandes par règles, répond à quelques échanges simples par des textes fixes (salutation, remerciement, « qui es-tu ? », « que sais-tu faire ? ») et affiche que la conversation libre demande l'IA branchée (`AI_PROVIDER` et la clé dans le `.env`, jamais dans le code). Aucun contenu clinique écrit d'avance.
   - Si l'IA branchée ne répond pas (panne, hors format, délai), le tour repasse par les règles ; hors des six demandes, Stive dit que l'IA ne répond pas.
4. **Périmètre métier.** Les consignes (`STIVE_CHAT`, `consignes.ts`) en font un assistant pour professionnels : connaissances générales, points à vérifier, organisation, communication et accompagnement des propriétaires, suivi post-opératoire. Jamais de diagnostic sur un animal précis, ni dose ni prescription (renvoi au RCP et au référentiel du cabinet), la décision revient au vétérinaire, Stive se dit IA.
   - Ces consignes ne suffisent pas : chaque réponse passe le **contrôle déterministe** de `domains/stive/garde.ts`. Un dosage (quantité d'un médicament, mg/kg, posologie chiffrée, fréquence d'administration), une prescription, un diagnostic, une fausse identité (vétérinaire, humain), un lien, une adresse ou un numéro font écarter **toute** la réponse.
   - Rien du texte écarté n'est gardé : l'écran affiche à la place un renvoi sûr (pour un dosage, au RCP et au référentiel), avec la mention « Réponse remplacée par les garde-fous ».
   - Le contrôle de lien, d'adresse et de numéro est celui de Numa (`CONTACT_PATTERN`, `conversations/guard.ts`). Les autres règles de Numa ne sont pas reprises telles quelles, car trop larges pour un échange entre professionnels (« il s'agit de… », « en tant que vétérinaire, vous… », un poids en kg).
5. **Données envoyées au prestataire** :
   - la question ;
   - les 12 derniers messages de la conversation, déjà filtrés par les accès (une réponse masquée part comme « réponse masquée ») ;
   - les cartes, résumées en une ligne, sans leur détail ;
   - les résultats d'outils réduits au nécessaire : prénom et espèce de l'animal, intervention, J+n, état, niveau de triage, synthèse, décomptes ; prénoms des vétérinaires pour l'agenda.

   Ne partent **jamais** : le nom, le numéro, l'e-mail ou l'adresse d'un propriétaire, le texte ou les destinataires d'un brouillon, l'intitulé libre d'un créneau d'agenda, un identifiant interne.
   - Les propos de propriétaires (synthèse) sont des données non fiables : regroupés sous `synthese_non_fiable`, nettoyés (adresses, numéros, nom du propriétaire masqués) et désignés comme tels dans les consignes, contre l'injection.
   - Aucun contenu de conversation dans les logs, le journal ou les erreurs : une erreur de la passerelle ne porte que sa classe et un code.

6. **Quota et bornes.** Chaque message de la personne compte une demande (`stive_usage`, 200 en Pro, 600 en Premium), quel que soit le nombre d'outils. À la limite, aucun appel au prestataire. Un tour fait au plus 4 appels au modèle (le dernier sans outils, pour forcer une réponse écrite), 6 appels d'outils et 60 secondes ; chaque appel a son délai de 30 secondes.
7. **Masquage.** Une réponse libre garde la liste des dossiers (et de l'agenda) que ses outils ont lus. Elle disparaît entièrement de l'historique dès qu'une de ces sources n'est plus visible pour la personne (dossier rendu privé, droit retiré), et ne repart plus chez le prestataire.

## Conséquences

- Tests unitaires : construction des messages et historique borné, réduction des données (ni propriétaire, ni identifiant, propos nettoyés), relecture des arguments, garde-fou (dosage, prescription, diagnostic, identité, contact, et réponses légitimes qui passent), boucle d'outils avec une passerelle factice (limites, délai, dernier tour sans outils), échanges simples, format de la requête et des appels d'outils contre l'imitation du fournisseur.
- Tests d'intégration sur une vraie base, contre l'imitation du fournisseur :
  - conversation multi-tours et quota ;
  - lecture d'un dossier, carte et journal ;
  - rien d'un dossier hors accès (autre vétérinaire, assistante sans accès clinique, dossier privé, autre cabinet) ;
  - masquage d'une réponse devenue inaccessible ;
  - action à confirmer ;
  - dosage écarté sans trace ;
  - panne, avec relais par les règles ;
  - limite sans appel.
- Test de bout en bout : conversation en mode simulé (salutation, présentation, question libre honnête), accessibilité, écran de 320 px.
- La question reste limitée à 500 caractères (contrainte de la base, migration 0024).
- Avant la mise en service : choisir le modèle texte (il doit savoir appeler des outils), relire les consignes avec un vétérinaire, et rejouer des questions piégées propres à Stive contre le fournisseur, comme `pnpm ia:evaluer` le fait pour Numa.
