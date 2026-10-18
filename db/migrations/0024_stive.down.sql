-- Annule 0024 ; local, CI ou retour arrière validé.
DROP FUNCTION app.purge_stive_messages();
DROP TABLE stive_usage;
DROP FUNCTION app.check_stive_usage();
DROP TABLE stive_proposals;
DROP FUNCTION app.check_stive_proposal();
DROP TABLE stive_messages;
DROP FUNCTION app.is_current_member(uuid);
