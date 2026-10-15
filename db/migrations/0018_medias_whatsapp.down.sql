-- Annule 0018 ; local, CI ou retour arrière validé. Les traces « fichier refusé » restent
-- lisibles (corps en clair) mais perdent leur code.

-- Tous cabinets confondus : la RLS forcée est levée le temps de la correction.
ALTER TABLE messages NO FORCE ROW LEVEL SECURITY;
UPDATE messages SET note_code = NULL, note_names = '{}' WHERE note_code = 'file_refused';
ALTER TABLE messages FORCE ROW LEVEL SECURITY;
ALTER TABLE messages DROP CONSTRAINT messages_note_code_check;
ALTER TABLE messages ADD CONSTRAINT messages_note_code_check
  CHECK (note_code IN ('group_created', 'left_group', 'group_emptied', 'group_stopped'));
