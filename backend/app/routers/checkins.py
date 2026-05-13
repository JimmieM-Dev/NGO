"""Check-in endpoints: the workhorse of Quorum.

A check-in is a pseudonymous event-activity row keyed by ``template_hash``.
Each fingerprint can check in to a given event at most once (DB unique
constraint + 409 response on the API).
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models, schemas
from app.biometric import normalize_template_hash
from app.db import get_db

router = APIRouter(tags=["checkins"])


def _require_event(db: Session, event_id: str) -> models.Event:
    event = db.get(models.Event, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="event not found")
    return event


def _find_attendee(db: Session, template_hash: str) -> models.Attendee | None:
    return db.scalars(
        select(models.Attendee).where(models.Attendee.template_hash == template_hash)
    ).first()


def _find_existing_checkin(
    db: Session, event_id: str, template_hash: str
) -> models.Checkin | None:
    return db.scalars(
        select(models.Checkin).where(
            models.Checkin.event_id == event_id,
            models.Checkin.template_hash == template_hash,
        )
    ).first()


@router.get("/events/{event_id}/lookup", response_model=schemas.LookupOut)
def lookup_fingerprint(
    event_id: str,
    template_hash: str,
    db: Session = Depends(get_db),
) -> schemas.LookupOut:
    """Used by the check-in screen to decide which flow to enter.

    Does NOT mutate state. Returns whether the fingerprint is already known
    globally and whether it has already checked into this event.
    """
    _require_event(db, event_id)
    h = normalize_template_hash(template_hash)
    attendee = _find_attendee(db, h)
    existing = _find_existing_checkin(db, event_id, h)
    return schemas.LookupOut(
        template_hash=h,
        attendee_known=attendee is not None,
        already_checked_in=existing is not None,
    )


@router.post(
    "/events/{event_id}/checkins",
    response_model=schemas.CheckinResult,
    status_code=201,
)
def create_checkin(
    event_id: str,
    payload: schemas.CheckinIn,
    db: Session = Depends(get_db),
) -> schemas.CheckinResult:
    _require_event(db, event_id)
    template_hash = normalize_template_hash(payload.template_hash)

    # 1. Refuse a second check-in for the same fingerprint at the same event.
    existing = _find_existing_checkin(db, event_id, template_hash)
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail={
                "reason": f"Already checked in at {existing.checked_in_at.isoformat()}",
                "checkin_id": existing.id,
            },
        )

    # 2. Resolve the attendee (or create one).
    attendee = _find_attendee(db, template_hash)
    welcome_back = attendee is not None

    if attendee is None:
        if payload.flow == "returning":
            raise HTTPException(
                status_code=404,
                detail=(
                    "Fingerprint not recognized. Pick 'On the invitee list' or "
                    "'New attendee / walk-in'."
                ),
            )

        if payload.flow == "invitee":
            invitee = db.get(models.Invitee, payload.invitee_id)
            if invitee is None or invitee.event_id != event_id:
                raise HTTPException(status_code=404, detail="invitee not found")
            if invitee.claimed_by_attendee_id is not None:
                raise HTTPException(
                    status_code=409,
                    detail="that invitee row is already claimed by another fingerprint",
                )
            attendee = models.Attendee(
                id=str(uuid.uuid4()),
                template_hash=template_hash,
                display_name=invitee.display_name,
                phone_last4=invitee.phone_last4,
            )
            db.add(attendee)
            db.flush()
            invitee.claimed_by_attendee_id = attendee.id

        elif payload.flow == "walkin":
            assert payload.display_name is not None  # enforced by schema
            attendee = models.Attendee(
                id=str(uuid.uuid4()),
                template_hash=template_hash,
                display_name=payload.display_name.strip(),
                phone_last4=payload.phone_last4,
            )
            db.add(attendee)
            db.flush()

    # 3. Record the check-in.
    checkin = models.Checkin(
        id=str(uuid.uuid4()),
        event_id=event_id,
        template_hash=template_hash,
        lat=payload.lat,
        lng=payload.lng,
    )
    db.add(checkin)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        # Race: another request slipped a checkin in between the lookup and the insert.
        raise HTTPException(
            status_code=409,
            detail={"reason": "Already checked in at this event"},
        ) from exc

    db.refresh(checkin)
    return schemas.CheckinResult(
        checkin=schemas.CheckinOut.model_validate(checkin),
        welcome_back=welcome_back,
        attendee_known=True,
    )


@router.get("/events/{event_id}/checkins", response_model=list[schemas.CheckinOut])
def list_checkins(
    event_id: str,
    db: Session = Depends(get_db),
) -> list[models.Checkin]:
    """Anonymous roster — never includes names. Operator-safe."""
    _require_event(db, event_id)
    rows = db.scalars(
        select(models.Checkin)
        .where(models.Checkin.event_id == event_id)
        .order_by(models.Checkin.checked_in_at.desc())
    ).all()
    return list(rows)
