-- Application identity projection for Keycloak-backed authentication.
-- Safe to run against either the older local-auth schema or the current schema.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS keycloak_subject VARCHAR(64);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'password_hash'
    ) THEN
        ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_users_keycloak_subject
    ON users(keycloak_subject)
    WHERE keycloak_subject IS NOT NULL;
