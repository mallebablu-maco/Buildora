"""Application settings, read from environment variables (see backend/.env.example)."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")

    environment: str = "development"
    # Public project URL and publishable key. The service-role key is never needed and must never be added here.
    supabase_url: str = ""
    supabase_publishable_key: str = ""
    # Optional pinned signing keys (JWKS JSON) for tests/offline use. Normally the keys are fetched from Supabase.
    supabase_jwks_json: str = ""
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    # Supabase "Session pooler" connection string. It contains the database password: a SECRET. Keep it only in the
    # git-ignored backend/.env and in Render's environment settings.
    database_url: str = ""
    db_pool_size: int = 5
    db_max_overflow: int = 5
    db_pool_timeout: int = 10  # seconds to wait for a free connection before answering 503
    db_statement_timeout_ms: int = 15000

    @field_validator("supabase_url")
    @classmethod
    def _base_url(cls, v: str) -> str:
        """Accept the dashboard's API URL with or without the /rest/v1 path and trailing slashes."""
        return v.strip().rstrip("/").removesuffix("/rest/v1").rstrip("/")

    @field_validator("database_url")
    @classmethod
    def _driver(cls, v: str) -> str:
        """Supabase hands out postgres:// or postgresql:// URLs; use the psycopg 3 driver."""
        v = v.strip()
        for plain in ("postgres://", "postgresql://"):
            if v.startswith(plain):
                return "postgresql+psycopg://" + v[len(plain):]
        return v

    @property
    def db_configured(self) -> bool:
        return bool(self.database_url)

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.cors_origins.split(",") if o.strip()]

    @property
    def issuer(self) -> str:
        return f"{self.supabase_url}/auth/v1"

    @property
    def jwks_url(self) -> str:
        return f"{self.issuer}/.well-known/jwks.json"

    @property
    def auth_configured(self) -> bool:
        return bool(self.supabase_url)

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
