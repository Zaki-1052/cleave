# backend/config.py
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://cleave:dev@localhost:5432/cleave"

    # Auth
    SECRET_KEY: str = "change-me-in-production-min-32chars!!"
    REFRESH_SECRET_KEY: str = "change-me-too-in-production-min-32ch!!"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
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

    # Download tokens
    DOWNLOAD_TOKEN_EXPIRY_SECONDS: int = 300  # 5 minutes
    IGV_TOKEN_EXPIRY_SECONDS: int = 3600  # 60 minutes (IGV sessions are interactive)

    # Batch download limits
    BATCH_DOWNLOAD_MAX_FILES: int = 100
    BATCH_DOWNLOAD_MAX_BYTES: int = 10 * 1024 * 1024 * 1024  # 10 GB

    # Worker
    WORKER_POLL_INTERVAL_SECONDS: float = 2

    # Pipeline concurrency
    MAX_CONCURRENT_REACTIONS: int = 8

    # SSE
    SSE_KEEPALIVE_SECONDS: int = 15

    # Email (Amazon SES)
    AWS_SES_REGION: str = ""  # empty = SES disabled (dev/test)
    AWS_SES_FROM_EMAIL: str = ""  # must be SES-verified address in production
    APP_URL: str = "http://localhost:5173"  # frontend URL for email links

    # Password reset
    RESET_TOKEN_LIFETIME_SECONDS: int = 3600  # 1 hour

    # Genomes (Phase 3)
    GENOME_INDEX_DIR: str = "/data/cleave/genomes"

    # Storage Lifecycle (Phase 7.1)
    CLEANUP_ENABLED: bool = False
    CLEANUP_INTERVAL_HOURS: float = 24.0
    LOG_RETENTION_DAYS: int = 30
    STORAGE_QUOTA_BYTES: int = 0  # 0 = no quota (gauge shows raw usage only)
    TUS_STAGING_RETENTION_HOURS: int = 48

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]


settings = Settings()
