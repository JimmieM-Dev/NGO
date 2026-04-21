"""Reporting endpoints: stats, duplicates, CSV export."""
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


@router.get("/stats", response_model=schemas.EventStats)
def event_stats(event_id: str, db: Session = Depends(get_db)) -> schemas.EventStats:
    if db.get(models.Event, event_id) is None:
        raise HTTPException(status_code=404, detail="event not found")

    total = db.scalar(
        select(func.count(models.Registration.id)).where(
            models.Registration.event_id == event_id
        )
    ) or 0
    duplicates = db.scalar(
        select(func.count(models.Registration.id)).where(
            models.Registration.event_id == event_id,
            models.Registration.is_duplicate.is_(True),
        )
    ) or 0
    return schemas.EventStats(
        event_id=event_id,
        total=total,
        unique=total - duplicates,
        duplicates=duplicates,
    )


@router.get("/duplicates", response_model=list[schemas.RegistrationOut])
def list_duplicates(event_id: str, db: Session = Depends(get_db)) -> list[models.Registration]:
    if db.get(models.Event, event_id) is None:
        raise HTTPException(status_code=404, detail="event not found")

    q = (
        select(models.Registration)
        .where(
            models.Registration.event_id == event_id,
            models.Registration.is_duplicate.is_(True),
        )
        .order_by(models.Registration.created_at.desc())
    )
    return list(db.scalars(q).all())


@router.get("/export.csv")
def export_csv(event_id: str, db: Session = Depends(get_db)) -> StreamingResponse:
    event = db.get(models.Event, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="event not found")

    rows = db.scalars(
        select(models.Registration)
        .where(models.Registration.event_id == event_id)
        .order_by(models.Registration.created_at.asc())
    ).all()

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "id",
            "full_name",
            "national_id",
            "phone",
            "fingerprint_sha256",
            "fingerprint_dhash",
            "is_duplicate",
            "duplicate_reason",
            "duplicate_of_id",
            "created_at",
        ]
    )
    for r in rows:
        writer.writerow(
            [
                r.id,
                r.full_name,
                r.national_id,
                r.phone,
                r.fingerprint_sha256,
                r.fingerprint_dhash,
                "1" if r.is_duplicate else "0",
                r.duplicate_reason or "",
                r.duplicate_of_id or "",
                r.created_at.isoformat(),
            ]
        )
    buffer.seek(0)
    filename = f"event-{event.id}.csv"
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
