-- 0015 : espace cabinet en anglais et langue de Numa corrigeable (phase 2, lot 19).
--
-- Cahier des charges §2 : l'interface existe en français et en anglais ; Numa écrit au
-- propriétaire dans sa langue. La langue de l'interface est un choix de chaque personne ;
-- celle d'un propriétaire vient du dossier importé, peut être détectée dans ses messages et
-- se corrige par le vétérinaire. Les textes que la base garde pour l'équipe (motif d'un
-- triage automatique, trace dans un groupe) sont désormais aussi codés, pour être affichés
-- dans la langue de la personne qui les lit.

-- Langue de l'interface, par personne ------------------------------------------------------

ALTER TABLE users ADD COLUMN ui_locale language NOT NULL DEFAULT 'fr';

-- Langue d'un propriétaire pour ce suivi : d'où vient-elle ? ------------------------------

-- import : dossier du logiciel vétérinaire ; detected : reconnue dans ses messages ;
-- vet : choisie par le cabinet, que la détection ne remplace jamais.
CREATE TYPE language_source AS ENUM ('import', 'detected', 'vet');
ALTER TABLE followup_contacts
  ADD COLUMN language_source language_source NOT NULL DEFAULT 'import';
GRANT UPDATE (language_source) ON followup_contacts TO stivea_app;

-- Motif codé d'un triage automatique ------------------------------------------------------

-- Le texte (`reason`) reste la trace d'origine ; le code permet de l'afficher dans la
-- langue du lecteur. Un triage écrit par un vétérinaire n'a pas de code : son texte est le sien.
ALTER TABLE triage_events ADD COLUMN reason_code text
  CHECK (reason_code IN ('red_flag', 'rule', 'concern', 'none', 'after_end'));
ALTER TABLE triage_events ADD CONSTRAINT triage_events_reason_code_source
  CHECK (reason_code IS NULL OR source <> 'vet');

-- Historique en ajout seul : la reprise des lignes existantes suspend le contrôle le temps
-- de cette migration, puis le rétablit.
ALTER TABLE triage_events DISABLE TRIGGER triage_events_append_only;
UPDATE triage_events SET reason_code = CASE
    WHEN reason LIKE 'Signal d''urgence reconnu%' THEN 'red_flag'
    WHEN reason LIKE 'Signe d''alerte du suivi :%' THEN 'rule'
    WHEN reason LIKE 'Inquiétude ou signe à vérifier%' THEN 'concern'
    WHEN reason = 'Aucun signe d''alerte.' THEN 'none'
    WHEN reason LIKE 'Le propriétaire a réécrit après la fin%' THEN 'after_end'
  END
  WHERE source = 'rule';
ALTER TABLE triage_events ENABLE TRIGGER triage_events_append_only;

-- Trace d'un groupe WhatsApp (création, départ, fermeture) --------------------------------

-- `note_names` : prénoms des propriétaires cités dans la trace, rien d'autre.
ALTER TABLE messages
  ADD COLUMN note_code text
    CHECK (note_code IN ('group_created', 'left_group', 'group_emptied', 'group_stopped')),
  ADD COLUMN note_names text[] NOT NULL DEFAULT '{}'
    CHECK (cardinality(note_names) <= 4);
ALTER TABLE messages ADD CONSTRAINT messages_note_system_only
  CHECK (note_code IS NULL OR author = 'system');

UPDATE messages SET
    note_code = CASE
      WHEN body LIKE 'Groupe WhatsApp du suivi créé avec %' THEN 'group_created'
      WHEN body LIKE '% a quitté le groupe ; plus personne%' THEN 'group_emptied'
      WHEN body LIKE '% a quitté le groupe.' THEN 'left_group'
      WHEN body LIKE 'Groupe fermé : % a demandé l''arrêt du suivi.' THEN 'group_stopped'
    END,
    note_names = CASE
      WHEN body LIKE 'Groupe WhatsApp du suivi créé avec %' THEN regexp_split_to_array(
        regexp_replace(body, '^Groupe WhatsApp du suivi créé avec (.*) \(simulé\)\.$', '\1'),
        '(, | et )')
      WHEN body LIKE '% a quitté le groupe%' THEN ARRAY[split_part(body, ' a quitté', 1)]
      WHEN body LIKE 'Groupe fermé : % a demandé l''arrêt du suivi.' THEN ARRAY[
        regexp_replace(body, '^Groupe fermé : (.*) a demandé l''arrêt du suivi\.$', '\1')]
      ELSE '{}'
    END
  WHERE author = 'system';
