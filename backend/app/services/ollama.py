import httpx
from app.core.config import get_settings

settings = get_settings()

class OllamaError(RuntimeError):
    pass

async def embed_text(text: str) -> list[float]:
    async with httpx.AsyncClient(timeout=120) as client:
        response = await client.post(f"{settings.ollama_base_url}/api/embed", json={"model": settings.ollama_embed_model, "input": text})
    if response.status_code >= 400:
        raise OllamaError(f"Ollama embedding failed: {response.text}")
    embeddings = response.json().get("embeddings") or []
    if not embeddings:
        raise OllamaError("Ollama returned no embedding")
    vector = embeddings[0]
    if len(vector) != settings.embedding_dimension:
        raise OllamaError(f"Embedding dimension mismatch. Expected {settings.embedding_dimension}, got {len(vector)}")
    return vector

async def chat(messages: list[dict[str, str]]) -> str:
    payload = {"model": settings.ollama_chat_model, "messages": messages, "stream": False, "options": {"temperature": 0.2}}
    async with httpx.AsyncClient(timeout=300) as client:
        response = await client.post(f"{settings.ollama_base_url}/api/chat", json=payload)
    if response.status_code >= 400:
        raise OllamaError(f"Ollama chat failed: {response.text}")
    return response.json()["message"]["content"].strip()
