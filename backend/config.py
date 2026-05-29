import os
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = os.path.abspath(os.path.dirname(__file__))


# Defaults a developer might forget to override — fail loud in production.
DEV_DEFAULT_SECRET = "dev-secret"
DEV_DEFAULT_JWT_SECRET = "dev-jwt-secret"
MIN_SECRET_BYTES = 32


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", DEV_DEFAULT_SECRET)
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", DEV_DEFAULT_JWT_SECRET)

    SQLALCHEMY_DATABASE_URI = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg2://postgres:postgres@localhost:5432/pug_accommodation",
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")]

    UPLOAD_FOLDER = os.path.abspath(os.path.join(BASE_DIR, os.getenv("UPLOAD_FOLDER", "../uploads")))
    MAX_CONTENT_LENGTH = int(os.getenv("MAX_CONTENT_LENGTH_MB", "25")) * 1024 * 1024

    JWT_ACCESS_TOKEN_EXPIRES = 60 * 60 * 8  # 8 hours
    JWT_REFRESH_TOKEN_EXPIRES = 60 * 60 * 24 * 14  # 14 days

    # JWT lives in httpOnly cookies (Phase 1). Header auth is intentionally
    # disabled so XSS cannot exfiltrate a bearer token.
    JWT_TOKEN_LOCATION = ["cookies"]
    JWT_COOKIE_CSRF_PROTECT = True
    JWT_CSRF_IN_COOKIES = True
    JWT_ACCESS_COOKIE_PATH = "/api/v1"
    JWT_REFRESH_COOKIE_PATH = "/api/v1/auth/refresh"
    # SameSite + Secure defaults are tightened in ProductionConfig.
    JWT_COOKIE_SAMESITE = "Lax"
    JWT_COOKIE_SECURE = False

    # --- Phase 2: rate limiting ------------------------------------------
    # If REDIS_URL is set the limiter and (later) Celery share it. Without
    # it, Flask-Limiter falls back to its in-memory store — fine for dev
    # but per-process, so multi-worker prod must set REDIS_URL.
    REDIS_URL = os.getenv("REDIS_URL")
    RATELIMIT_STORAGE_URI = REDIS_URL or "memory://"
    RATELIMIT_DEFAULT = "300 per minute"
    RATELIMIT_HEADERS_ENABLED = True
    RATELIMIT_ENABLED = True


class DevelopmentConfig(Config):
    DEBUG = True
    ENV = "development"


class TestingConfig(Config):
    DEBUG = True
    TESTING = True
    ENV = "testing"
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "TEST_DATABASE_URL", "sqlite:///:memory:"
    )
    # Disabled by default so test_auth.py etc. don't trip the bucket.
    # The dedicated rate-limit test re-enables it on its own app instance.
    RATELIMIT_ENABLED = False
    RATELIMIT_STORAGE_URI = "memory://"


class ProductionConfig(Config):
    DEBUG = False
    ENV = "production"
    # Cookies must be sent over HTTPS only and never cross-site in prod.
    JWT_COOKIE_SECURE = True
    JWT_COOKIE_SAMESITE = "Strict"

    @classmethod
    def validate(cls, cfg) -> None:
        """Fail loud at boot if required prod secrets / CORS aren't safe.

        Called from create_app when FLASK_ENV=production. Raising here
        keeps a misconfigured deployment from ever serving traffic."""
        problems: list[str] = []

        for key, bad_default in (
            ("SECRET_KEY", DEV_DEFAULT_SECRET),
            ("JWT_SECRET_KEY", DEV_DEFAULT_JWT_SECRET),
        ):
            value = cfg.get(key)
            if not value:
                problems.append(f"{key} is not set")
                continue
            if value == bad_default:
                problems.append(f"{key} is still the dev default ('{bad_default}')")
                continue
            if len(str(value)) < MIN_SECRET_BYTES:
                problems.append(f"{key} must be at least {MIN_SECRET_BYTES} characters")

        origins = cfg.get("CORS_ORIGINS") or []
        if "*" in origins:
            problems.append(
                "CORS_ORIGINS contains '*' — production must list explicit origins"
            )

        if problems:
            raise RuntimeError(
                "Insecure production configuration:\n  - " + "\n  - ".join(problems)
            )


config_map = {
    "development": DevelopmentConfig,
    "testing": TestingConfig,
    "production": ProductionConfig,
    "default": DevelopmentConfig,
}
