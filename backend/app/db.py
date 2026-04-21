"""Database engine, session, and base model."""
from __future__ import annotations

import os
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


def _default_database_url() -> str:
    # When running on Fly.io the deploy tool mounts a persistent volume at /data.
    if os.path.isdir("/data") and os.access("/data", os.W_OK):
        return "sqlite:////data/app.db"
    return "sqlite:///./ngo.db"


DATABASE_URL = os.environ.get("NGO_DATABASE_URL", _default_database_url())

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
    future=True,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create all tables. Importing models registers them on Base."""
    from app import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
