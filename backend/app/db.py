"""Database engine, session, and base model."""
from __future__ import annotations

import os
from collections.abc import Generator

from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


def _default_database_url() -> str:
    # When running on Fly.io the deploy tool mounts a persistent volume at /data.
    if os.path.isdir("/data") and os.access("/data", os.W_OK):
        return "sqlite:////data/app.db"
    return "sqlite:///./quorum.db"


# QUORUM_DATABASE_URL is the canonical env var; the legacy NGO_DATABASE_URL is
# still honored so older Fly secrets keep working until they're rotated.
DATABASE_URL = (
    os.environ.get("QUORUM_DATABASE_URL")
    or os.environ.get("NGO_DATABASE_URL")
    or _default_database_url()
)

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
    """Create all tables. Importing models registers them on Base.

    Quorum's Phase 1 schema replaces the legacy ``registrations`` table with
    ``attendees`` / ``invitees`` / ``checkins``. If we detect the old table on
    disk we drop it (the MVP has no migration tool wired up yet and demo data
    is intentionally non-precious).
    """
    from app import models  # noqa: F401

    inspector = inspect(engine)
    existing = set(inspector.get_table_names())
    if "registrations" in existing:
        from sqlalchemy import text

        with engine.begin() as conn:
            conn.execute(text("DROP TABLE IF EXISTS registrations"))

    Base.metadata.create_all(bind=engine)
