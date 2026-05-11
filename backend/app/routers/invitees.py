"""Invitee endpoints: per-event guest list (uploaded in advance)."""
from __future__ import annotations

import csv
import io
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app import models, schemas
from app.db import get_db

router = APIRouter(prefix="/events/{event_id}/invitees", tags=["invitees"])


def _require_event(db: Session, event_id: str) -> models.Event:
    event = db.get(models.Event, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="event not found")
    return event


@router.get("", response_model=list[schemas.InviteeOut])
def list_invitees(
    event_id: str,
    q: str | None = None,
    unclaimed_only: bool = False,
    db: Session = Depends(get_db),
) -> list[models.Invitee]:
    _require_event(db, event_id)

    stmt = select(models.Invitee).where(models.Invitee.event_id == event_id)
    if unclaimed_only:
        stmt = stmt.where(models.Invitee.claimed_by_attendee_id.is_(None))
    if q:
        term = f"%{q.strip().lower()}%"
        stmt = stmt.where(
            or_(
                models.Invitee.display_name.ilike(term),
                models.Invitee.phone_last4 == q.strip(),
            )
        )
    stmt = stmt.order_by(models.Invitee.display_name.asc())
    return list(db.scalars(stmt).all())


@router.post("", response_model=list[schemas.InviteeOut], status_code=201)
def add_invitees(
    event_id: str,
    payload: schemas.InviteeBulkIn,
    db: Session = Depends(get_db),
) -> list[models.Invitee]:
    _require_event(db, event_id)
    rows = [
        models.Invitee(
            id=str(uuid.uuid4()),
            event_id=event_id,
            display_name=item.display_name.strip(),
            phone_last4=item.phone_last4,
        )
        for item in payload.invitees
    ]
    db.add_all(rows)
    db.commit()
    for r in rows:
        db.refresh(r)
    return rows


@router.post("/bulk-csv", response_model=list[schemas.InviteeOut], status_code=201)
async def upload_invitees_csv(
    event_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> list[models.Invitee]:
    """Upload a CSV with header ``display_name,phone_last4`` (phone_last4 optional)."""
    _require_event(db, event_id)

    raw = await file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=422, detail="csv must be UTF-8") from exc

    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames is None or "display_name" not in {
        (h or "").strip().lower() for h in reader.fieldnames
    }:
        raise HTTPException(
            status_code=422,
            detail="csv must have a 'display_name' column (and optional 'phone_last4')",
        )

    # normalize headers
    normalized: list[dict[str, str]] = []
    for row in reader:
        n = {(k or "").strip().lower(): (v or "").strip() for k, v in row.items()}
        if not n.get("display_name"):
            continue
        normalized.append(n)

    if not normalized:
        raise HTTPException(status_code=422, detail="csv has no rows")

    rows = []
    for n in normalized:
        phone = n.get("phone_last4") or None
        if phone and (len(phone) != 4 or not phone.isdigit()):
            phone = None
        rows.append(
            models.Invitee(
                id=str(uuid.uuid4()),
                event_id=event_id,
                display_name=n["display_name"],
                phone_last4=phone,
            )
        )
    db.add_all(rows)
    db.commit()
    for r in rows:
        db.refresh(r)
    return rows


@router.delete("/{invitee_id}", status_code=204)
def delete_invitee(event_id: str, invitee_id: str, db: Session = Depends(get_db)) -> None:
    invitee = db.get(models.Invitee, invitee_id)
    if invitee is None or invitee.event_id != event_id:
        raise HTTPException(status_code=404, detail="invitee not found")
    db.delete(invitee)
    db.commit()
