"""SQLAlchemy ORM models for Quorum.

The data model deliberately separates pseudonymous event activity from PII:

- ``Checkin`` rows (per-event activity) carry only ``template_hash``, timestamp,
  and optional location. No name, no phone, no national ID.
- ``Attendee`` is the *one* table that carries PII. It maps a stable
  ``template_hash`` to a ``display_name`` (and optional ``phone_last4``).
  It is admin-only.
- ``Invitee`` is a per-event "expected guest" row uploaded by the organizer
  beforehand. When an unknown fingerprint matches an invitee at check-in time,
  the invitee row is "claimed" and an ``Attendee`` row is created.

The fingerprint itself is reduced to a ``template_hash`` (currently SHA-256 of
the captured image bytes; will become an ISO 19794-2 minutiae template hash
when a real fingerprint scanner is wired in).
"""
from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import DateTime, Float, ForeignKey, Index, String, UniqueConstraint
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

    invitees: Mapped[list[Invitee]] = relationship(
        back_populates="event",
        cascade="all, delete-orphan",
    )
    checkins: Mapped[list[Checkin]] = relationship(
        back_populates="event",
        cascade="all, delete-orphan",
    )


class Attendee(Base):
    """The single PII-bearing row. One per real person across all events.

    Created the first time an unknown fingerprint is bound to either an
    invitee row or a walk-in name. Subsequent events recognize the fingerprint
    via ``template_hash`` and reuse the same attendee.
    """

    __tablename__ = "attendees"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    template_hash: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    phone_last4: Mapped[str | None] = mapped_column(String(4))
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    invitees: Mapped[list[Invitee]] = relationship(back_populates="claimed_by")


class Invitee(Base):
    """Per-event "expected guest" row. Uploaded by the organizer in advance."""

    __tablename__ = "invitees"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    event_id: Mapped[str] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), nullable=False
    )
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    phone_last4: Mapped[str | None] = mapped_column(String(4))
    claimed_by_attendee_id: Mapped[str | None] = mapped_column(
        ForeignKey("attendees.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    event: Mapped[Event] = relationship(back_populates="invitees")
    claimed_by: Mapped[Attendee | None] = relationship(back_populates="invitees")

    __table_args__ = (
        Index("ix_invitees_event_name", "event_id", "display_name"),
        Index("ix_invitees_event_phone_last4", "event_id", "phone_last4"),
    )


class Checkin(Base):
    """The pseudonymous per-event activity log.

    A unique constraint on ``(event_id, template_hash)`` enforces "one
    check-in per fingerprint per event" at the database level.
    """

    __tablename__ = "checkins"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    event_id: Mapped[str] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), nullable=False
    )
    template_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    checked_in_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    lat: Mapped[float | None] = mapped_column(Float)
    lng: Mapped[float | None] = mapped_column(Float)

    event: Mapped[Event] = relationship(back_populates="checkins")

    __table_args__ = (
        UniqueConstraint("event_id", "template_hash", name="uq_checkins_event_template"),
        Index("ix_checkins_event_time", "event_id", "checked_in_at"),
    )
