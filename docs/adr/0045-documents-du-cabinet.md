# 0045 — Documents du cabinet

- Statut : accepté (27 octobre 2026), complète l'ADR 0044
- Migration 0029

## Contexte

La maquette validée par Aaron prévoit, sous Protocoles, un onglet Documents : la bibliothèque de l'équipe (fiches de consignes remises aux propriétaires, procédures internes, documents administratifs). L'ADR 0044 l'avait reportée, faute de stockage et de droits propres.

## Décision

1. **Une table `cabinet_documents`, isolée par cabinet** (RLS forcée, politique `tenant_isolation`). Elle garde le titre, la catégorie, la clé du fichier dans le stockage objet privé, son type, sa taille, son empreinte, l'auteur et les dates. Jamais d'URL ni de contenu.
2. **Droits, repris des protocoles.**
   - Lecture : qui voit les protocoles (`protocols.manage`, `protocols.create_own` ou `followups.launch`). Un assistant n'y a donc pas accès par défaut.
   - Ajout et suppression : `protocols.manage` seulement.
   - Le serveur revérifie tout ; un refus d'accès est un « introuvable ».
3. **Fichiers acceptés.**
   - PDF, JPEG, PNG ou WebP, 5 Mo au plus. Le type est lu dans les premiers octets, jamais repris du nom.
   - Une image est recopiée sans ses métadonnées (position, appareil), comme les photos des propriétaires (ADR 0019).
   - 200 documents au plus par cabinet : la bibliothèque n'est pas un espace de stockage.
4. **Ouverture par lien signé.**
   - Même mécanisme que les photos (ADR 0019), avec une portée à part : un lien de document ne vaut jamais pour une photo, ni l'inverse.
   - Il dure cinq minutes au lieu de deux, car la liste reste ouverte plus longtemps qu'un dossier.
   - Lien périmé, altéré ou d'une autre personne : retour à la liste, qui donne des liens neufs. Sans session : 404.
   - Un PDF est toujours téléchargé, jamais affiché ; une image s'affiche dans un bac à sable. Rien n'est mis en cache.
5. **Suppression.**
   - Le fichier quitte le stockage dans la même transaction que le marquage de la ligne : si le stockage refuse, rien n'est marqué.
   - La ligne reste pour la traçabilité et ne revient jamais (déclencheur). L'application ne peut ni effacer une ligne ni changer un titre (droits par colonne).
6. **Journal.** Ajout, ouverture et suppression sont journalisés, avec le type et la taille seulement, jamais le titre.
7. **Pas de dossier patient.** La page le rappelle : ces documents sont visibles de toute l'équipe qui voit les protocoles.

## Reporté

- **Lecture par Stive.** Stive ne lit pas encore les documents. Il faudra extraire le texte, le borner et le faire passer par ses garde-fous.
- **Analyse antivirus.** Elle n'existe pas en local. Elle est à prévoir avec l'hébergement réel, avant le premier vrai cabinet. En attendant, un PDF n'est jamais ouvert dans l'application.
