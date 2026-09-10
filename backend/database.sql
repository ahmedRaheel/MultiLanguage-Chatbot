-- ============================================================
-- Multilingual RAG Chatbot Database
-- PostgreSQL + pgvector
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- documents
-- ============================================================

CREATE TABLE IF NOT EXISTS documents
(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filename VARCHAR(300) NOT NULL,
    content_type VARCHAR(120) NULL,
    size_bytes INTEGER NOT NULL,
    chunk_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- document_chunks
-- IMPORTANT:
-- nomic-embed-text uses 768 dimensions in your configuration.
-- ============================================================

CREATE TABLE IF NOT EXISTS document_chunks
(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    document_id UUID NOT NULL,

    chunk_index INTEGER NOT NULL,

    page_number INTEGER NULL,

    content TEXT NOT NULL,

    embedding VECTOR(768) NOT NULL,

    CONSTRAINT fk_document_chunks_documents
        FOREIGN KEY (document_id)
        REFERENCES documents(id)
        ON DELETE CASCADE
);

-- SQLAlchemy index=True on document_id
CREATE INDEX IF NOT EXISTS ix_document_chunks_document_id
    ON document_chunks(document_id);

-- Recommended: prevent duplicate chunk numbers per document
CREATE UNIQUE INDEX IF NOT EXISTS ux_document_chunks_document_chunk
    ON document_chunks(document_id, chunk_index);

-- ============================================================
-- Vector HNSW index
-- Matches:
-- postgresql_using="hnsw"
-- m = 16
-- ef_construction = 64
-- vector_cosine_ops
-- ============================================================

CREATE INDEX IF NOT EXISTS ix_document_chunks_embedding_hnsw
    ON document_chunks
    USING hnsw (embedding vector_cosine_ops)
    WITH
    (
        m = 16,
        ef_construction = 64
    );

-- ============================================================
-- conversations
-- ============================================================

CREATE TABLE IF NOT EXISTS conversations
(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- chat_messages
-- ============================================================

CREATE TABLE IF NOT EXISTS chat_messages
(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    conversation_id UUID NOT NULL,

    role VARCHAR(20) NOT NULL,

    content TEXT NOT NULL,

    language VARCHAR(20) NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_chat_messages_conversations
        FOREIGN KEY (conversation_id)
        REFERENCES conversations(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_chat_messages_conversation_id
    ON chat_messages(conversation_id);

-- Useful for loading chat history efficiently
CREATE INDEX IF NOT EXISTS ix_chat_messages_conversation_created_at
    ON chat_messages(conversation_id, created_at);

-- ============================================================
-- OPTIONAL constraints
-- ============================================================

ALTER TABLE chat_messages
DROP CONSTRAINT IF EXISTS ck_chat_messages_role;

ALTER TABLE chat_messages
ADD CONSTRAINT ck_chat_messages_role
CHECK (role IN ('user', 'assistant', 'system'));

-- ============================================================
-- Verification
-- ============================================================

SELECT extname
FROM pg_extension
WHERE extname IN ('vector', 'pgcrypto');

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN
      (
          'documents',
          'document_chunks',
          'conversations',
          'chat_messages'
      )
ORDER BY table_name;