from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.config import get_settings
from app.models.entities import Document, DocumentChunk
from app.services.ollama import embed_text

settings = get_settings()

async def retrieve(db: Session, query: str):
    vector = await embed_text(query)
    distance = DocumentChunk.embedding.cosine_distance(vector).label("distance")
    rows = db.execute(
        select(DocumentChunk, Document.filename, distance)
        .join(Document, Document.id == DocumentChunk.document_id)
        .order_by(distance)
        .limit(settings.top_k)
    ).all()
    return [{"chunk": chunk, "filename": filename, "score": max(0.0, 1.0 - float(dist))} for chunk, filename, dist in rows]
