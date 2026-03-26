# backend/config.py
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://cleave:dev@localhost:5432/cleave"

    # Auth
    SECRET_KEY: str = "change-me-in-production"
    REFRESH_SECRET_KEY: str = "change-me-too"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    COOKIE_SECURE: bool = False

    # App
    CORS_ORIGINS: str = "http://localhost:5173"
    STORAGE_ROOT: str = "/data/cleave"
    UPLOAD_MAX_SIZE_MB: int = 5000
    PIPELINE_MODE: str = "mock"

    # File serving (Phase 7 NGINX)
    NGINX_FILE_SERVING: bool = False
    NGINX_INTERNAL_PREFIX: str = "/internal-files/"

    # Batch download limits
    BATCH_DOWNLOAD_MAX_FILES: int = 100
    BATCH_DOWNLOAD_MAX_BYTES: int = 10 * 1024 * 1024 * 1024  # 10 GB

    # Worker
    WORKER_POLL_INTERVAL_SECONDS: int = 2

    # Email (Phase 3)
    SMTP_HOST: str = ""
    SMTP_PORT: str = ""
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""

    # Genomes (Phase 3)
    GENOME_INDEX_DIR: str = "/data/cleave/genomes"

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]


settings = Settings()
