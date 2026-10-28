# 0044 — Menu en quatre rubriques, avec onglets

- Statut : accepté (27 octobre 2026), prolonge l'ADR 0033 pour l'espace cabinet
- Pas de migration

## Contexte

Aaron a comparé l'espace cabinet au tableau de bord de Limova. Il a validé une maquette cliquable des pages, puis a demandé un menu plus court :

- « mets juste la page Accueil, Suivi, Protocoles, Cabinet », les autres pages devenant des onglets ;
- un style qui mélange le logiciel actuel et la maquette ;
- depuis la vue d'ensemble, parler directement à Stive, ce qui mène à la conversation.

## Décision

1. **Quatre rubriques dans la barre latérale** (`src/ui/navigation.ts`). Chaque rubrique a ses onglets, affichés en tête de page par `SectionTabs` :

   | Rubrique   | Onglets                                                                                    |
   | ---------- | ------------------------------------------------------------------------------------------ |
   | Accueil    | Vue d'ensemble, Stive, Assistants IA, Raccourcis                                           |
   | Suivi      | Suivis, Animaux, Alertes, Agenda                                                           |
   | Protocoles | Protocoles, Documents (ADR 0045), Contenus                                                 |
   | Cabinet    | Équipe et droits, Facturation, Réglages, Intégrations, Automatisations, Journal d'activité |
   - Démarrage guidé et Centre d'aide restent en bas du menu ; la carte d'identité mène à Mon compte.
   - Une rubrique mène à son premier onglet permis.
   - Un onglet n'apparaît qu'avec la permission de son écran ; le serveur refuse toujours l'accès (404) sans elle.
   - « Protocoles » n'existe que si son premier onglet est permis : son nom tromperait sinon.

2. **Nouvelles pages, sans nouvelle donnée.**
   - **Assistants IA** : Numa et Stive, ce que chacun fait et ne fait jamais, et le décompte des demandes à Stive de la personne.
   - **Raccourcis** : des demandes toutes prêtes. Chacune passe par l'action « Demander à Stive », avec les mêmes droits et le même décompte qu'une demande écrite. Rien ne part vers un propriétaire sans clic.
   - **Contenus** : les brouillons de Stive, repris de la conversation de la personne (30 jours, visible d'elle seule). Un brouillon se reprend dans le dossier, jamais depuis cette page.
   - **Intégrations** : les connexions WhatsApp, dr.veto et mandat, sorties des réglages, et le fournisseur des assistants IA. Seul le mode du fournisseur est lu, jamais la clé ni l'adresse.
   - **Automatisations** : l'ancienne page « Tâches en échec », précédée de ce qui tourne tout seul. Aucune automatisation ne prend de décision médicale.
3. **Style.** Le point de Stive passe sur la nuit verte de la maquette, avec la barre « Demandez à Stive » et un bouton « Ouvrir Stive ». Les rubriques du menu sont plus grandes, avec une pastille menthe pour la rubrique ouverte. Les onglets reprennent les pastilles de l'ADR 0033.
4. **Centre d'aide.** `/app/aide` renvoie vers le centre d'aide du site public, dans la langue de l'espace cabinet. Avant, ce lien du menu menait à une page absente.

## Suite

**Documents.** La bibliothèque de fichiers du cabinet a demandé un stockage et des droits propres : elle est décrite dans l'ADR 0045, avec sa migration.
