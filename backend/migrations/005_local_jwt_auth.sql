-- 005_local_jwt_auth.sql
-- Migrate the legacy Keycloak-backed user projection to local PostgreSQL authentication.
-- Safe to run more than once.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Ensure the users table has the exact columns required by app.models.entities.User.
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- Keycloak is no longer part of the authentication model.
DROP INDEX IF EXISTS ix_users_keycloak_subject;
ALTER TABLE users DROP COLUMN IF EXISTS keycloak_subject;

-- Normalize existing data before applying constraints.
UPDATE users
SET username = COALESCE(NULLIF(BTRIM(username), ''), 'legacy-' || id::text)
WHERE username IS NULL OR BTRIM(username) = '';

UPDATE users
SET email = COALESCE(NULLIF(LOWER(BTRIM(email)), ''), id::text || '@legacy.invalid')
WHERE email IS NULL OR BTRIM(email) = '';

UPDATE users
SET role = CASE WHEN LOWER(role) = 'admin' THEN 'admin' ELSE 'user' END
WHERE role IS NULL OR LOWER(role) NOT IN ('admin', 'user') OR role <> LOWER(role);

UPDATE users SET role = 'user' WHERE role IS NULL;
UPDATE users SET is_active = TRUE WHERE is_active IS NULL;
UPDATE users SET created_at = NOW() WHERE created_at IS NULL;

-- Users migrated from Keycloak do not have a recoverable local password.
-- Keep the column NOT NULL without inventing a usable password, and disable those accounts.
UPDATE users
SET password_hash = '!LOCAL_PASSWORD_NOT_SET!',
    is_active = FALSE
WHERE password_hash IS NULL OR BTRIM(password_hash) = '';

ALTER TABLE users ALTER COLUMN username SET NOT NULL;
ALTER TABLE users ALTER COLUMN email SET NOT NULL;
ALTER TABLE users ALTER COLUMN password_hash SET NOT NULL;
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'user';
ALTER TABLE users ALTER COLUMN role SET NOT NULL;
ALTER TABLE users ALTER COLUMN is_active SET DEFAULT TRUE;
ALTER TABLE users ALTER COLUMN is_active SET NOT NULL;
ALTER TABLE users ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE users ALTER COLUMN created_at SET NOT NULL;

-- Replace case-sensitive uniqueness with application-consistent case-insensitive uniqueness.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
DROP INDEX IF EXISTS ix_users_username;
DROP INDEX IF EXISTS ix_users_email;

CREATE UNIQUE INDEX IF NOT EXISTS ux_users_username_ci ON users (LOWER(username));
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_email_ci ON users (LOWER(email));

-- Only the two application roles are valid.
ALTER TABLE users DROP CONSTRAINT IF EXISTS ck_users_role;
ALTER TABLE users
    ADD CONSTRAINT ck_users_role CHECK (role IN ('admin', 'user'));

COMMIT;
