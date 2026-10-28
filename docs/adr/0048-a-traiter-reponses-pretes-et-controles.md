# 0048 — « À traiter », réponses prêtes et contrôles du jour

- Statut : accepté (28 octobre 2026), étape 3 (première partie) du plan « Faire gagner du temps au vétérinaire »
- Migration 0031 ; complète les ADR 0017 (alertes), 0020 (synthèse), 0034 (Stive) et 0046-0047

## Contexte

Après les étapes 1 et 2, le lancement ne coûte plus qu'un clic. Restaient trois pertes de temps relevées dans le plan : ouvrir chaque alerte une à une, réécrire les mêmes réponses aux propriétaires, et rouvrir chaque dossier avant un contrôle pour relire la synthèse puis la recopier dans dr.veto.

Le cahier des charges ne change pas : seul un vétérinaire accuse réception d'une alerte ou la clôt (§7), aucune réponse au propriétaire ne part sans une personne (§10, §11), les résumés restent dans Stivea Vet sans écriture automatique dans dr.veto (§9).

## Décision

1. **Boîte « À traiter » sur la vue d'ensemble**, pour qui lit les dossiers en clinique. Elle remplace la carte « Priorités ».
   - Elle réunit les alertes en cours, les propriétaires qui attendent l'équipe et, pour l'administrateur, les tâches en échec.
   - Ordre : urgences sans accusé, urgences reçues, signes à surveiller sans accusé, réponses attendues, signes à surveiller reçus, tâches en échec ; les plus récentes d'abord. Douze lignes au plus, la suite reste dans Alertes.
   - Chaque ligne propose son action : accuser réception, clore ou confier l'alerte (mêmes contrôles qu'avant, ADR 0017), répondre, voir l'agenda, relancer ou abandonner la tâche. Après l'action, on revient sur la boîte.
   - « Le propriétaire attend l'équipe » : Numa est en pause ou relayée par l'équipe, et le dernier message vient du propriétaire. Une alerte du même dossier prime : il n'apparaît qu'une fois.
   - Les bandeaux d'urgence en tête de page restent : ils sont les seuls annoncés aux lecteurs d'écran, les lignes de la boîte ne le sont pas une seconde fois.
2. **Contrôles du jour.**
   - Un animal y figure quand la date de contrôle de sa fiche ou un rendez-vous de contrôle Stivea tombe aujourd'hui (heure de Paris), huit au plus. Le point du jour l'annonce par un raccourci.
   - La synthèse est celle du dossier (ADR 0020) : mêmes droits, même cache, mêmes garde-fous. Elle se lit dans la vue d'ensemble, repliée, chargée à part pour ne pas retenir la page.
3. **« Copier pour dr.veto »**, dans la vue d'ensemble et dans le dossier.
   - Le bouton met un texte brut dans le presse-papiers de la personne : animal, intervention, jour, échanges, évolution, signaux, alertes, questions ouvertes. La dernière ligne dit que la synthèse a été préparée par l'IA et doit être relue, sans diagnostic ni conduite à tenir.
   - Stivea Vet n'écrit rien dans dr.veto. La copie est notée au journal (`synthesis.copied`, cible `drveto`), sans le texte.
4. **Réponses prêtes, dans la zone de saisie du dossier.**
   - Les modèles du cabinet (table `reply_templates`, migration 0031) : nom, texte de 1 000 caractères au plus, langue du propriétaire ; 30 par cabinet. L'administrateur les écrit dans Protocoles › Réponses prêtes ; qui répond aux propriétaires les lit. Isolés par cabinet (RLS). Le journal garde l'ajout, la modification et la suppression, jamais le texte.
   - Les champs `{animal}`, `{proprietaire}`, `{veterinaire}` et `{cabinet}` sont remplis au moment de poser le texte ; le modèle ne contient aucune donnée d'animal.
   - Les trois phrases d'organisation de Stive (prendre des nouvelles, demander une photo, demander d'appeler, ADR 0034), sans contenu médical, présentées comme venant d'un assistant IA.
   - Seuls les modèles dans la langue du propriétaire sont proposés. Un clic pose le texte et rien d'autre : la personne relit, corrige et envoie. L'envoi garde ses contrôles (droit, accord, état du suivi).

## Reporté à la seconde partie de l'étape 3

- Alertes « à surveiller » prises en charge par l'assistante, si l'administrateur le permet (une urgence ne lui est jamais confiée d'office).
- Récapitulatif au vétérinaire à 12 h et à 18 h.
- Accusé de réception depuis la notification WhatsApp du vétérinaire.

## Conséquences

- Le vétérinaire n'ouvre plus que ce qui demande sa décision, depuis un seul endroit.
- Aucun garde-fou n'est retiré : droits, accord du propriétaire, garde-fous de la synthèse et journal restent ceux des ADR précédentes.
- « Appeler le propriétaire » n'est pas proposé en lien direct : le numéro reste masqué dans l'application. La réponse prête « Demander d'appeler le cabinet » en tient lieu.
