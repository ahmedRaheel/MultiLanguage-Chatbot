from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=10000)
    conversation_id: UUID | None = None
    language: str | None = None
    use_knowledge_base: bool = True


class SourceItem(BaseModel):
    document_id: UUID
    filename: str
    page_number: int | None
    chunk_index: int
    score: float
    excerpt: str


class ChatResponse(BaseModel):
    conversation_id: UUID
    answer: str
    sources: list[SourceItem]
    cache_hit: bool = False
    cache_similarity: float | None = None


class MessageResponse(BaseModel):
    id: UUID
    role: str
    content: str
    language: str | None
    created_at: datetime


class DocumentResponse(BaseModel):
    id: UUID
    filename: str
    content_type: str | None
    size_bytes: int
    chunk_count: int
    created_at: datetime
