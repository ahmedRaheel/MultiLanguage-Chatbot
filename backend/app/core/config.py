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

    keycloak_public_url: str = "http://localhost:8080"
    keycloak_internal_url: str = "http://localhost:8080"
    keycloak_realm: str = "polyglot"
    keycloak_client_id: str = "polyglot-bff"
    keycloak_client_secret: str = "change-this-bff-secret"

    access_cookie_name: str = "polyglot_access"
    refresh_cookie_name: str = "polyglot_refresh"
    cookie_secure: bool = False
    cookie_samesite: str = "lax"

    cors_origins: str = "http://localhost:5173"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def keycloak_issuer(self) -> str:
        return f"{self.keycloak_public_url.rstrip('/')}/realms/{self.keycloak_realm}"

    @property
    def keycloak_realm_url(self) -> str:
        return f"{self.keycloak_internal_url.rstrip('/')}/realms/{self.keycloak_realm}"

    @property
    def keycloak_token_url(self) -> str:
        return f"{self.keycloak_realm_url}/protocol/openid-connect/token"

    @property
    def keycloak_logout_url(self) -> str:
        return f"{self.keycloak_realm_url}/protocol/openid-connect/logout"

    @property
    def keycloak_jwks_url(self) -> str:
        return f"{self.keycloak_realm_url}/protocol/openid-connect/certs"

    @property
    def keycloak_admin_users_url(self) -> str:
        return f"{self.keycloak_internal_url.rstrip('/')}/admin/realms/{self.keycloak_realm}/users"

    @property
    def keycloak_admin_roles_url(self) -> str:
        return f"{self.keycloak_internal_url.rstrip('/')}/admin/realms/{self.keycloak_realm}/roles"


@lru_cache
def get_settings() -> Settings:
    return Settings()
