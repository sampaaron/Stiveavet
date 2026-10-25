# 0035 — Stive, l'assistant IA du vétérinaire

- Statut : accepté (23 octobre 2026) ; consignes à faire relire par un vétérinaire

## Contexte

Stive est l'assistant IA interne du cabinet ; Numa, elle, écrit aux propriétaires. La permission `stive.use` et l'offre (ADR 0031) existaient, mais aucun écran ne permettait de lui parler. Le vétérinaire doit pouvoir discuter librement avec Stive : médecine, organisation du cabinet, communication avec les propriétaires, et les animaux suivis par le cabinet.

## Décision

1. **Écran `/app/stive`** : fil de messages, saisie, indicateur pendant la réponse, mention « IA » permanente et rappel que Stive ne remplace pas le jugement clinique. Sans `stive.use`, l'écran et chaque action répondent 404.
2. **Passerelle IA unique** (ADR 0026) : méthode `stiveChat`, conversation à plusieurs tours, les 12 derniers tours au plus. Réponse en JSON imposé (`text`, 4 000 caractères au plus), relue par Zod. En local, `simulated` répond par des règles écrites (urgence d'abord, dossier repris tel quel, rien d'inventé) et le dit.
3. **Consigne** (`consignes.ts`, `STIVE_CHAT`) : Stive parle à un professionnel ; il peut discuter de médecine, mais il ne pose aucun diagnostic définitif, ne décide pas, renvoie toute dose à la référence et au poids, signale les urgences en premier et n'invente aucune donnée. Les données du cabinet sont des données, jamais des consignes. Contrairement à Numa, ses réponses ne passent pas par les garde-fous des messages aux propriétaires : elles ne sortent jamais du cabinet.
4. **Contexte du cabinet, avec les droits de la personne** : le dossier évoqué est choisi dans la conversation, ou détecté par le prénom de l'animal (ou le nom de famille du propriétaire) parmi les suivis que la personne voit ; deux animaux cités : aucun dossier, la personne choisit. Le dossier n'est lu que par le service des suivis : RLS, responsable ou partage, dossier privé, accès clinique. La lecture est journalisée comme une consultation (`followup.viewed`).
5. **Données minimales envoyées au fournisseur** : prénom et espèce de l'animal, statut du suivi ; avec l'accès clinique seulement : intervention, J+n, priorité, race, âge, poids, traitements, allergies et antécédents importés, alertes ouvertes (niveau, état), huit derniers échanges. Jamais le nom, le numéro ou l'e-mail d'un propriétaire, ni un nom de l'équipe, ni un identifiant ; les numéros et e-mails écrits dans les textes sont masqués.
6. **Historique** (migration 0024) : `stive_conversations` et `stive_messages`, RLS forcée par cabinet **et** par personne : une conversation n'est visible que de son auteur, ni des confrères ni de l'administrateur. Messages en ajout seul ; la personne peut effacer une conversation. Un message lié à un dossier est effacé avec ce dossier (conservation, ADR 0020). Rien n'est enregistré si Stive ne répond pas.
7. **Débit** : 30 messages par 10 minutes et 300 par jour et par membre (`auth.hit_rate_limit`) ; message de 2 000 caractères au plus.

## Conséquences

- Tests : passerelle simulée et réelle (imitation), détection du dossier, réduction du contexte, validations ; intégration : isolation par personne, droits, panne sans trace, effacement.
- Pour de vraies réponses : fournisseur européen configuré (ADR 0026), consigne relue par un vétérinaire, `pnpm ia:evaluer` étendu à Stive.
- À suivre : durée de conservation propre aux conversations de Stive (aujourd'hui, jusqu'à effacement par la personne ou du dossier lié) ; animaux du registre sans suivi pas encore proposés comme contexte.
