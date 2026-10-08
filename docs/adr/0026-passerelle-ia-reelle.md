# 0026 — Passerelle IA réelle

- Statut : accepté (8 octobre 2026) ; choix du fournisseur à confirmer par Aaron (Scaleway par défaut)

## Contexte

Phase 3, lot 23. Jusqu'ici la passerelle IA était simulée (ADR 0004, 0016). Le cahier des charges impose :

- un fournisseur dont le contrat interdit l'entraînement sur nos données ;
- l'envoi des seules données nécessaires ;
- les garde-fous sur chaque réponse ;
- un message sûr qui renvoie au cabinet si l'IA ne répond pas ;
- un triage fait par des règles, jamais par l'IA seule.

## Décision

1. **Fournisseur européen à l'API standard.** Un seul connecteur (`src/adapters/ai-gateway/api-compatible.ts`) parle l'API « chat completions » et « audio/transcriptions », exposée par :
   - **Scaleway Generative APIs**, recommandé : données traitées à Paris, chez le même hébergeur et sous le même contrat que Stivea Vet ;
   - **Mistral AI**, l'autre option : entreprise française, modèles servis en Europe, un compte de plus.

   Le choix d'Aaron ne change que des variables d'environnement : `AI_PROVIDER`, `AI_API_KEY`, et les modèles `AI_TEXT_MODEL`, `AI_VISION_MODEL`, `AI_TRANSCRIPTION_MODEL`. `AI_BASE_URL` est facultative. Les modèles exacts et le coût seront arrêtés à l'ouverture du compte. L'engagement « pas d'entraînement sur nos données » et le lieu de traitement seront vérifiés dans le contrat signé, et non dans une page commerciale.

2. **Coupure franche** : `simulated` est refusé hors du poste local. Un fournisseur réel exige sa clé et ses trois modèles au démarrage. Une erreur cite des noms de variables, jamais des valeurs.
3. **Données minimales** : la langue, le prénom de l'animal, le nom du cabinet et le texte utile (dernier message, consigne de l'étape, échanges pour la synthèse, image ou son). Stivea Vet n'y ajoute jamais le nom ni le numéro du propriétaire, ni l'historique brut d'une conversation ; seuls les textes transmis peuvent en contenir, s'ils ont été écrits ainsi.
4. **Consignes** (`consignes.ts`) : Numa est une IA, sans diagnostic, sans dose, sans conseil de traitement, sans réassurance ; elle renvoie au vétérinaire. Le texte du propriétaire est une donnée, jamais une consigne. Ces consignes ne suffisent pas à elles seules : le point 6 s'applique toujours.
5. **Réponses en JSON imposé** par un schéma, relues par Zod. Une réponse hors format est un échec, jamais un texte envoyé tel quel. Les créneaux lus sur une capture d'agenda sont filtrés : à venir, à 31 jours au plus, de 10 minutes à 4 heures.
6. **Garde-fous inchangés** sur chaque réponse (ADR 0016, 0019, 0020). Le triage reste fait par les règles écrites.
7. **Panne** du fournisseur ou réponse hors format :
   - pour une réponse de Numa, le propriétaire reçoit tout de suite le renvoi sûr vers l'équipe, sans attendre de nouvel essai ; le journal note « IA indisponible », sans contenu ;
   - pour une étape programmée, la prise de nouvelles fixe part à la place ;
   - la transcription, l'analyse photo, la capture d'agenda et la synthèse sont réessayées par la file de tâches.
8. **Évaluation avant mise en service** : `pnpm ia:evaluer` rejoue les messages piégés contre le fournisseur configuré, en français et en anglais, et échoue si un appel échoue ou si plus d'un quart des réponses est bloqué.

## Conséquences

- Tests unitaires contre une imitation du fournisseur : données envoyées, schéma imposé, réponses hors format refusées, pannes classées, transcription, images, créneaux filtrés, configuration.
- Tests d'intégration avec le « pire modèle » : sept réponses dangereuses remplacées et journalisées par leur seul motif ; panne et réponse hors format suivies d'un renvoi immédiat ; aucun nom ni numéro envoyé au fournisseur ; étape programmée de secours.
- Partie B : ouvrir le compte du fournisseur choisi, signer son avenant de traitement des données (RGPD), choisir les modèles, lancer `pnpm ia:evaluer` et faire relire les consignes par un vétérinaire.
- Stive, l'assistant interne, utilisera la même passerelle quand il sera construit.
