# 0015 — Lancement manuel d'un suivi : import figé, fiche propre au suivi, cycle de vie vérifié

- Statut : accepté (7 octobre 2026)

## Contexte

Phase 2, lot 12. Cahier des charges §4 : le vétérinaire cherche l'animal dans dr.veto, Stivea Vet importe en lecture seule le résumé utile (animal, propriétaires, intervention, date, contrôle, allergies, antécédents, traitements actifs), propose une fiche de lancement (protocole, premier déclencheur, questions, rappels, alertes, contrôle) que le vétérinaire peut tout modifier, puis il clique lui-même sur **Lancer le suivi**. Le premier déclencheur est souvent 3 à 4 h après l'intervention, sans être imposé. §5 : le vétérinaire peut modifier un suivi en cours, le mettre en pause, l'arrêter ou le reprendre. Architecture §11 : jamais les notes brutes du dossier vétérinaire. dr.veto reste simulé (ADR 0004).

## Décision

1. **Connecteur dr.veto** : `searchAnimals` et `importRecord` s'ajoutent à l'interface. La simulation sert six animaux fictifs (numéros dans la plage réservée à la fiction 06 39 98 xx xx, posologies marquées « exemple fictif »). La recherche et l'import exigent la connexion dr.veto du cabinet ; le lancement exige celle du numéro WhatsApp (sauf suivi test, qui n'envoie rien).
2. **Import figé** : `followup_imports` garde le résumé tel que dr.veto le donnait (allergies, antécédents bornés par la base, référence, auteur, date) ; aucune modification possible. L'animal est retrouvé par sa référence dr.veto ; un animal n'a qu'un suivi ouvert à la fois.
3. **Fiche propre au suivi** : les étapes (`followup_steps`) et signes d'alerte (`followup_alert_rules`) sont copiés depuis la version de protocole choisie, puis modifiables pour cet animal sans toucher au protocole du cabinet. Chaque enregistrement crée une révision ; les lignes remplacées restent, marquées `superseded_at`, et ne reviennent jamais.
4. **Modifier un suivi en cours** remplace les étapes à venir, jamais les passées : une étape dont l'heure est passée est verrouillée à l'écran et refusée par le service. La version de protocole reste figée (trigger de la migration 0004).
5. **Traitements** : un traitement importé n'est rappelé qu'après validation par un vétérinaire (`reminderTreatments`) ; un traitement ajouté par le vétérinaire est validé à la saisie. Validation et retrait sont définitifs (vérifiés par la base) ; le nom et la posologie ne changent jamais (droits par colonne). Numa ne crée ni ne modifie de posologie.
6. **Droits** : préparer la fiche demande `followups.launch` et l'accès clinique au dossier ; un assistant à qui l'administrateur a ouvert ces droits peut préparer. Valider un traitement, modifier un suivi lancé, mettre en pause, arrêter, reprendre ou réactiver sont des décisions de vétérinaire. **Lancer** revient au vétérinaire responsable, au nom duquel Numa écrira. Le libellé de la permission devient « Préparer et lancer un suivi (lancement réservé aux vétérinaires) ».
7. **Lancement atomique** : une seule transaction enregistre la fiche, passe le suivi en cours (motif `launched`), enregistre l'usage facturable (`launch:<suivi>`, refusé si la facturation bloque les nouveaux suivis), planifie le premier message de Numa (`followup:<suivi>:intro`, à l'heure choisie ou tout de suite si elle est passée), publie `followup.launched` et journalise. Un échec n'écrit rien.
8. **Cycle de vie vérifié par la base** : brouillon → en cours ; en cours, en pause et repris par l'équipe entre eux ; arrêt ; réactivation d'un suivi terminé (usage `reactivation`). Jamais de retour au brouillon ; un lancement sans version validée, sans premier message ou sans date de début est refusé. Chaque changement porte un motif technique (`vet_paused`, `vet_resumed`, `vet_stopped`, `vet_reactivated`) dans l'historique des statuts. L'arrêt annule les tâches en attente du suivi ; une pause les laisse en file, les exécutants (lot 13 et suivants) vérifient l'état du suivi avant tout envoi.

## Conséquences

- Les tests d'intégration couvrent la recherche, l'import, la proposition de protocole, la préparation par un assistant, la validation des traitements, le lancement (version, usage, tâche, outbox, journal), la modification d'un suivi en cours, la pause, la reprise, l'arrêt, la réactivation, les refus de la base et l'isolation entre cabinets. Le parcours complet est testé de bout en bout sur ordinateur et à 320 px.
- Le premier message, le consentement et la conversation arrivent au lot 13 ; les rappels de traitement et la fin à la date de contrôle au lot 15.
- Le vrai dr.veto (phase 3) n'aura qu'à implémenter `searchAnimals` et `importRecord`.
