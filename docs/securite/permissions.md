# Matrice des permissions

<!-- Généré par `pnpm docs:permissions` depuis src/domains/equipe. Ne pas modifier à la main. -->

Les droits sont des permissions précises, attribuées à chaque membre. « oui » : donnée par défaut au rôle ; « sur décision » : l'administrateur peut l'ouvrir ; « non » : impossible pour ce rôle (refusé par la base).

| Permission                                                                                    | Vétérinaire administrateur | Vétérinaire  | Assistant vétérinaire |
| --------------------------------------------------------------------------------------------- | -------------------------- | ------------ | --------------------- |
| Modifier les réglages du cabinet (`organization.settings`)                                    | oui                        | non          | non                   |
| Gérer l'équipe et les droits (`team.manage`)                                                  | oui                        | non          | non                   |
| Créer et modifier les protocoles (`protocols.manage`)                                         | oui                        | sur décision | non                   |
| Créer et modifier ses propres protocoles (`protocols.create_own`)                             | oui                        | oui          | non                   |
| Gérer l'abonnement et la facturation (`billing.manage`)                                       | oui                        | non          | non                   |
| Consulter le journal d'activité (`activity_log.read`)                                         | oui                        | non          | non                   |
| Voir tous les suivis du cabinet (hors dossiers privés) (`followups.read_all`)                 | oui                        | sur décision | non                   |
| Voir ses suivis et ceux partagés avec soi (`followups.read_own`)                              | oui                        | oui          | non                   |
| Voir la liste organisationnelle des suivis, sans données cliniques (`followups.read_summary`) | oui                        | non          | oui                   |
| Lancer un suivi (`followups.launch`)                                                          | oui                        | oui          | sur décision          |
| Partager ses suivis avec un confrère (`followups.share`)                                      | oui                        | oui          | non                   |
| Lire conversations, photos, vocaux et synthèses cliniques (`clinical.read`)                   | oui                        | oui          | sur décision          |
| Répondre aux propriétaires (`owner_messages.reply`)                                           | oui                        | oui          | sur décision          |
| Confirmer manuellement un rendez-vous (`appointments.confirm`)                                | oui                        | oui          | sur décision          |
| Consulter l'agenda (`agenda.read`)                                                            | oui                        | oui          | oui                   |
| Utiliser Stive, l'assistant IA interne (`stive.use`)                                          | oui                        | oui          | sur décision          |

## Accès à un dossier (droits par défaut)

Ordre de contrôle : personne authentifiée → membre actif du cabinet → permission → responsable ou partage explicite → dossier privé → journal d'audit. Un dossier invisible répond 404, comme un dossier inexistant ou d'un autre cabinet.

| Situation                                     | Vétérinaire administrateur | Vétérinaire     | Assistant vétérinaire  |
| --------------------------------------------- | -------------------------- | --------------- | ---------------------- |
| Responsable du suivi                          | complet                    | complet         | sans objet             |
| Responsable, dossier privé                    | complet                    | complet         | sans objet             |
| Suivi d'un confrère                           | complet                    | invisible (404) | organisation seulement |
| Suivi d'un confrère, partagé avec moi         | complet                    | complet         | sans objet             |
| Dossier privé d'un confrère                   | invisible (404)            | invisible (404) | invisible (404)        |
| Dossier privé d'un confrère, partagé avec moi | complet                    | complet         | sans objet             |

« organisation seulement » : animal, propriétaire, statut, responsable, rendez-vous de contrôle. « complet » : en plus, intervention, priorité, conversation, photos, vocaux et synthèses. Un assistant à qui l'administrateur ouvre `clinical.read` passe à « complet » sur les dossiers qu'il voit.
