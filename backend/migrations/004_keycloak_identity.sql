-- Move authentication back to Keycloak while keeping PostgreSQL application user projections.
-- Run against an existing chatbot database created by the PostgreSQL-auth build.

ALTER TABLE users ADD COLUMN IF NOT EXISTS keycloak_subject VARCHAR(64);
CREATE UNIQUE INDEX IF NOT EXISTS ix_users_keycloak_subject ON users (keycloak_subject) WHERE keycloak_subject IS NOT NULL;

-- Passwords are no longer stored or validated by this application.
ALTER TABLE users DROP COLUMN IF EXISTS password_hash;
