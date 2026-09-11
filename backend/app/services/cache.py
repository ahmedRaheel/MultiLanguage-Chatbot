import json
import re
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.entities import AnswerCache, KnowledgeState
from app.services.ollama import embed_text

settings = get_settings()


def normalize_query(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().lower())


def get_knowledge_version(db: Session) -> int:
    state = db.get(KnowledgeState, 1)
    if state is None:
        state = KnowledgeState(id=1, version=1)
        db.add(state)
        db.flush()
    return state.version


def bump_knowledge_version(db: Session) -> int:
    state = db.get(KnowledgeState, 1)
    if state is None:
        state = KnowledgeState(id=1, version=1)
        db.add(state)
    else:
        state.version += 1
        state.updated_at = datetime.now(timezone.utc)
    db.flush()
    return state.version


async def find_cached_answer(
    db: Session,
    query: str,
    language: str | None,
    use_knowledge_base: bool,
):
    normalized = normalize_query(query)
    version = get_knowledge_version(db)

    exact = db.scalar(
        select(AnswerCache)
        .where(
            AnswerCache.normalized_query == normalized,
            AnswerCache.knowledge_version == version,
            AnswerCache.use_knowledge_base == use_knowledge_base,
            AnswerCache.language == language,
        )
        .order_by(AnswerCache.created_at.desc())
        .limit(1)
    )

    if exact is not None:
        exact.hit_count += 1
        exact.last_used_at = datetime.now(timezone.utc)
        db.flush()
        return exact, 1.0

    vector = await embed_text(query)
    distance = AnswerCache.query_embedding.cosine_distance(vector).label("distance")

    row = db.execute(
        select(AnswerCache, distance)
        .where(
            AnswerCache.knowledge_version == version,
            AnswerCache.use_knowledge_base == use_knowledge_base,
            AnswerCache.language == language,
        )
        .order_by(distance)
        .limit(1)
    ).first()

    if row is None:
        return None, None

    cached, distance_value = row
    similarity = 1.0 - float(distance_value)
    if similarity < settings.cache_similarity_threshold:
        return None, similarity

    cached.hit_count += 1
    cached.last_used_at = datetime.now(timezone.utc)
    db.flush()
    return cached, similarity


async def save_cached_answer(
    db: Session,
    query: str,
    answer: str,
    sources: list[dict],
    language: str | None,
    use_knowledge_base: bool,
) -> None:
    db.add(
        AnswerCache(
            normalized_query=normalize_query(query),
            query_embedding=await embed_text(query),
            answer=answer,
            sources_json=json.dumps(sources, default=str),
            language=language,
            use_knowledge_base=use_knowledge_base,
            knowledge_version=get_knowledge_version(db),
        )
    )
