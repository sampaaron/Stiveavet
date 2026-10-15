-- 0018 : photos et vocaux reçus par WhatsApp (phase 3, lot 22, ADR 0025).
--
-- Le fichier est téléchargé chez Meta par une tâche, après le webhook. Un fichier refusé
-- (trop lourd, format non lu, expiré chez Meta) laisse une trace dans la conversation, pour
-- l'équipe : prénom du propriétaire seulement, aucun contenu.

ALTER TABLE messages DROP CONSTRAINT messages_note_code_check;
ALTER TABLE messages ADD CONSTRAINT messages_note_code_check
  CHECK (note_code IN ('group_created', 'left_group', 'group_emptied', 'group_stopped', 'file_refused'));
