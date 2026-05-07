from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.router import api_router
from app.core.config import settings
from app.db import Base, engine
from app import models  # noqa: F401

app = FastAPI(title=settings.app_name)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://0.0.0.0:5173"],
    # Dev: localhost, loopback, and LAN IPs (e.g. phone testing via Vite --host)
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(api_router, prefix="/api/v1")


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)
    _apply_lightweight_migrations()


def _apply_lightweight_migrations() -> None:
    """Add columns that postdate the original schema. Idempotent and safe to run on every boot."""
    statements = [
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(255)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS picture_url VARCHAR(1000)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_provider VARCHAR(30)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_subject VARCHAR(255)",
        "ALTER TABLE users ALTER COLUMN hashed_password DROP NOT NULL",
        "CREATE INDEX IF NOT EXISTS ix_users_oauth_provider ON users (oauth_provider)",
        "CREATE INDEX IF NOT EXISTS ix_users_oauth_subject ON users (oauth_subject)",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            try:
                conn.execute(text(stmt))
            except Exception:  # noqa: BLE001
                # Non-Postgres backends or already-applied changes; safe to ignore.
                pass


@app.get("/")
def root() -> dict[str, str]:
    return {"service": settings.app_name, "env": settings.app_env}
