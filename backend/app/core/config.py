from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://postgres:postgres123@localhost:5432/chatbot"

    ollama_base_url: str = "http://localhost:11434"
    ollama_chat_model: str = "llama3.2:3b"
    ollama_embed_model: str = "all-minilm"
    embedding_dimension: int = 384

    top_k: int = 5
    chunk_size: int = 1200
    chunk_overlap: int = 200
    max_upload_mb: int = 25
    cache_similarity_threshold: float = 0.94

    jwt_secret_key: str = "change-this-development-secret-to-a-long-random-value"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 15
    refresh_token_days: int = 7

    access_cookie_name: str = "chatbot_access"
    refresh_cookie_name: str = "chatbot_refresh"
    cookie_secure: bool = False
    cookie_samesite: str = "lax"

    admin_username: str = "admin"
    admin_email: str = "admin@chatbot.local"
    admin_password: str = "ChangeMe123!"

    cors_origins: str = "http://localhost:5173"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
