-- Run as PostgreSQL superuser while connected to the postgres database.
-- Stop Keycloak before running this script.

SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = 'keycloak'
  AND pid <> pg_backend_pid();

DROP DATABASE IF EXISTS keycloak WITH (FORCE);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'keycloak') THEN
        CREATE ROLE keycloak LOGIN PASSWORD 'keycloak123';
    ELSE
        ALTER ROLE keycloak WITH LOGIN PASSWORD 'keycloak123';
    END IF;
END $$;

CREATE DATABASE keycloak OWNER keycloak ENCODING 'UTF8' TEMPLATE template0;
