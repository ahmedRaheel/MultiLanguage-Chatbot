-- Upgrade an existing Polyglot/Nexa chatbot database to OAuth2 + RBAC + PostgreSQL CAG.
-- This script assumes EMBEDDING_DIMENSION=384 (all-minilm).
-- Run it against the chatbot database before starting API v2.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users
(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(255) NULL UNIQUE,
    password_hash VARCHAR(500) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'user',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_users_role CHECK (role IN ('admin', 'user'))
);

CREATE INDEX IF NOT EXISTS ix_users_username ON users(username);

-- Existing conversations may already contain rows. Keep this column nullable
-- during the upgrade; every new conversation created by API v2 has an owner.
ALTER TABLE conversations
    ADD COLUMN IF NOT EXISTS user_id UUID NULL;

CREATE INDEX IF NOT EXISTS ix_conversations_user_id
    ON conversations(user_id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_conversations_users'
    ) THEN
        ALTER TABLE conversations
            ADD CONSTRAINT fk_conversations_users
            FOREIGN KEY (user_id)
            REFERENCES users(id)
            ON DELETE CASCADE;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS knowledge_state
(
    id INTEGER PRIMARY KEY,
    version INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO knowledge_state(id, version)
VALUES (1, 1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS answer_cache
(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    normalized_query TEXT NOT NULL,
    query_embedding VECTOR(384) NOT NULL,
    answer TEXT NOT NULL,
    sources_json TEXT NOT NULL DEFAULT '[]',
    language VARCHAR(20) NULL,
    use_knowledge_base BOOLEAN NOT NULL DEFAULT TRUE,
    knowledge_version INTEGER NOT NULL,
    hit_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_answer_cache_embedding_hnsw
    ON answer_cache
    USING hnsw (query_embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS ix_answer_cache_lookup
    ON answer_cache(knowledge_version, use_knowledge_base, language);

-- Optional after you no longer need legacy anonymous conversations:
-- DELETE FROM chat_messages WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id IS NULL);
-- DELETE FROM conversations WHERE user_id IS NULL;
-- ALTER TABLE conversations ALTER COLUMN user_id SET NOT NULL;
