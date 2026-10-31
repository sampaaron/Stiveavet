-- Rôles PostgreSQL de Stivea Vet, pour le local et la CI uniquement.
-- En staging et en production, ces rôles sont créés par l'administrateur de la base
-- (console Scaleway) avec des mots de passe issus du gestionnaire de secrets.
--
-- Usage (superutilisateur) :
--   psql "$ADMIN_URL" -v migrator_password=... -v app_password=... -v worker_password=... -v database=stivea -f db/bootstrap/roles.sql
--
-- stivea_migrator : propriétaire du schéma, applique les migrations. Jamais utilisé par l'application.
-- stivea_app      : rôle de l'application. Ni propriétaire, ni BYPASSRLS, ni superutilisateur.
-- stivea_worker   : rôle du worker (ADR 0054). Mêmes droits que stivea_app, plus la file de tâches
--                   et les purges, que l'application web ne peut plus appeler.

\set ON_ERROR_STOP on

SELECT format('CREATE ROLE stivea_migrator LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB PASSWORD %L', :'migrator_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stivea_migrator') \gexec

SELECT format('CREATE ROLE stivea_app LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stivea_app') \gexec

SELECT format('CREATE ROLE stivea_worker LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB PASSWORD %L', :'worker_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stivea_worker') \gexec
GRANT stivea_app TO stivea_worker;

SELECT format('CREATE DATABASE %I OWNER stivea_migrator', :'database')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'database') \gexec

SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', :'database') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO stivea_app', :'database') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO stivea_worker', :'database') \gexec
