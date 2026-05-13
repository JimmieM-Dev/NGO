"""Reporting endpoints: per-event stats + CSV exports (anonymous / named)."""
from __future__ import annotations

import csv
import io

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import models, schemas
from app.db import get_db

router = APIRouter(prefix="/events/{event_id}", tags=["reports"])


def _require_event(db: Session, event_id: str) -> models.Event:
    event = db.get(models.Event, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="event not found")
    return event


@router.get("/stats", response_model=schemas.EventStats)
def event_stats(event_id: str, db: Session = Depends(get_db)) -> schemas.EventStats:
    _require_event(db, event_id)

    checked_in = db.scalar(
        select(func.count(models.Checkin.id)).where(models.Checkin.event_id == event_id)
    ) or 0
    invitees_total = db.scalar(
        select(func.count(models.Invitee.id)).where(models.Invitee.event_id == event_id)
    ) or 0
    invitees_claimed = db.scalar(
        select(func.count(models.Invitee.id)).where(
            models.Invitee.event_id == event_id,
            models.Invitee.claimed_by_attendee_id.is_not(None),
        )
    ) or 0

    return schemas.EventStats(
        event_id=event_id,
        checked_in=checked_in,
        invitees_total=invitees_total,
        invitees_claimed=invitees_claimed,
        walkins=max(checked_in - invitees_claimed, 0),
    )


@router.get("/export.csv")
def export_anonymous_csv(event_id: str, db: Session = Depends(get_db)) -> StreamingResponse:
    """Anonymous roster — no names. Safe to share."""
    event = _require_event(db, event_id)

    rows = db.scalars(
        select(models.Checkin)
        .where(models.Checkin.event_id == event_id)
        .order_by(models.Checkin.checked_in_at.asc())
    ).all()

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["checkin_id", "template_hash", "checked_in_at", "lat", "lng"])
    for r in rows:
        writer.writerow(
            [
                r.id,
                r.template_hash,
                r.checked_in_at.isoformat(),
                "" if r.lat is None else r.lat,
                "" if r.lng is None else r.lng,
            ]
        )
    buffer.seek(0)
    filename = f"quorum-event-{event.id}-anonymous.csv"
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export-named.csv")
def export_named_csv(event_id: str, db: Session = Depends(get_db)) -> StreamingResponse:
    """Named roster — joins to the attendee directory. Admin-only.

    NOTE: auth middleware will gate this in Phase 2. For now the endpoint is
    accessible to anyone on the API; the export filename is also explicit so
    accidental sharing is obvious.
    """
    event = _require_event(db, event_id)

    stmt = (
        select(models.Checkin, models.Attendee)
        .join(models.Attendee, models.Attendee.template_hash == models.Checkin.template_hash)
        .where(models.Checkin.event_id == event_id)
        .order_by(models.Checkin.checked_in_at.asc())
    )

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "checkin_id",
            "template_hash",
            "display_name",
            "phone_last4",
            "checked_in_at",
            "lat",
            "lng",
        ]
    )
    for checkin, attendee in db.execute(stmt):
        writer.writerow(
            [
                checkin.id,
                checkin.template_hash,
                attendee.display_name,
                attendee.phone_last4 or "",
                checkin.checked_in_at.isoformat(),
                "" if checkin.lat is None else checkin.lat,
                "" if checkin.lng is None else checkin.lng,
            ]
        )
    buffer.seek(0)
    filename = f"quorum-event-{event.id}-named.csv"
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
