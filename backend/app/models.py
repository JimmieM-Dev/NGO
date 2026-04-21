"""SQLAlchemy ORM models."""
from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def _utcnow() -> datetime:
    return datetime.now(UTC)


class Event(Base):
    __tablename__ = "events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    location: Mapped[str | None] = mapped_column(String(200))
    operator: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    registrations: Mapped[list[Registration]] = relationship(
        back_populates="event",
        cascade="all, delete-orphan",
    )


class Registration(Base):
    """An attendee's registration at a specific event.

    ``fingerprint_sha256`` is a SHA-256 of the raw captured fingerprint image bytes, used for
    exact-match dedup. ``fingerprint_dhash`` is a 64-bit difference hash represented as a
    16-char hex string, used for fuzzy matching with Hamming distance.
    """

    __tablename__ = "registrations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    event_id: Mapped[str] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), nullable=False
    )

    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    national_id: Mapped[str] = mapped_column(String(64), nullable=False)
    phone: Mapped[str] = mapped_column(String(32), nullable=False)

    fingerprint_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    fingerprint_dhash: Mapped[str] = mapped_column(String(16), nullable=False)
    fingerprint_image_b64: Mapped[str | None] = mapped_column(Text)

    is_duplicate: Mapped[bool] = mapped_column(default=False, nullable=False)
    duplicate_reason: Mapped[str | None] = mapped_column(String(200))
    duplicate_of_id: Mapped[str | None] = mapped_column(String(36))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    event: Mapped[Event] = relationship(back_populates="registrations")

    __table_args__ = (
        Index("ix_registrations_event_national_id", "event_id", "national_id"),
        Index("ix_registrations_event_phone", "event_id", "phone"),
        Index("ix_registrations_event_sha256", "event_id", "fingerprint_sha256"),
    )
