from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from app.core.config import settings

def _normalize_database_url(database_url: str) -> str:
    if database_url.startswith("postgres://"):
        return database_url.replace("postgres://", "postgresql+psycopg://", 1)
    if database_url.startswith("postgresql://") and "+psycopg" not in database_url:
        return database_url.replace("postgresql://", "postgresql+psycopg://", 1)
    return database_url


normalized_database_url = _normalize_database_url(settings.database_url)
connect_args = {"check_same_thread": False} if normalized_database_url.startswith("sqlite") else {}
engine = create_engine(normalized_database_url, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
