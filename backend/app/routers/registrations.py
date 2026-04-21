"""Registration endpoints, including duplicate detection."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, schemas
from app.biometric import DHASH_MATCH_THRESHOLD, hamming_distance_hex, hashes_from_b64_image
from app.db import get_db

router = APIRouter(prefix="/events/{event_id}/registrations", tags=["registrations"])


def _find_duplicate(
    db: Session,
    event_id: str,
    *,
    national_id: str,
    phone: str,
    fingerprint_sha256: str,
    fingerprint_dhash: str,
) -> tuple[models.Registration, str, str] | None:
    """Return ``(existing, reason, field)`` if the incoming registration matches a prior one.

    Match precedence: national_id > phone > fingerprint_sha256 > fingerprint_dhash.
    """
    existing_q = select(models.Registration).where(
        models.Registration.event_id == event_id,
        models.Registration.is_duplicate.is_(False),
    )

    for field, value, reason in (
        ("national_id", national_id, "National ID already registered"),
        ("phone", phone, "Phone number already registered"),
        ("fingerprint_sha256", fingerprint_sha256, "Identical fingerprint already registered"),
    ):
        match = db.scalars(existing_q.where(getattr(models.Registration, field) == value)).first()
        if match is not None:
            return match, reason, field

    candidates = db.scalars(existing_q).all()
    best: tuple[models.Registration, int] | None = None
    for candidate in candidates:
        distance = hamming_distance_hex(candidate.fingerprint_dhash, fingerprint_dhash)
        if distance <= DHASH_MATCH_THRESHOLD and (best is None or distance < best[1]):
            best = (candidate, distance)

    if best is not None:
        candidate, distance = best
        return (
            candidate,
            f"Fingerprint closely matches existing registration (distance={distance})",
            "fingerprint_dhash",
        )

    return None


@router.post("", response_model=schemas.RegistrationCreateResponse, status_code=201)
def create_registration(
    event_id: str,
    payload: schemas.RegistrationCreate,
    db: Session = Depends(get_db),
) -> schemas.RegistrationCreateResponse:
    event = db.get(models.Event, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="event not found")

    sha = payload.fingerprint_sha256
    dhash = payload.fingerprint_dhash
    if sha is None or dhash is None:
        assert payload.fingerprint_image_b64 is not None  # enforced by schema validator
        try:
            sha, dhash = hashes_from_b64_image(payload.fingerprint_image_b64)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    duplicate = _find_duplicate(
        db,
        event_id,
        national_id=payload.national_id.strip(),
        phone=payload.phone.strip(),
        fingerprint_sha256=sha.lower(),
        fingerprint_dhash=dhash.lower(),
    )

    registration = models.Registration(
        id=str(uuid.uuid4()),
        event_id=event_id,
        full_name=payload.full_name.strip(),
        national_id=payload.national_id.strip(),
        phone=payload.phone.strip(),
        fingerprint_sha256=sha.lower(),
        fingerprint_dhash=dhash.lower(),
        fingerprint_image_b64=payload.fingerprint_image_b64,
        is_duplicate=duplicate is not None,
        duplicate_reason=duplicate[1] if duplicate else None,
        duplicate_of_id=duplicate[0].id if duplicate else None,
    )
    db.add(registration)
    db.commit()
    db.refresh(registration)

    dup_info = None
    if duplicate is not None:
        matched, reason, field = duplicate
        dup_info = schemas.DuplicateInfo(
            reason=reason,
            matched_registration_id=matched.id,
            matched_field=field,
        )

    return schemas.RegistrationCreateResponse(
        registration=schemas.RegistrationOut.model_validate(registration),
        duplicate=dup_info,
    )


@router.get("", response_model=list[schemas.RegistrationOut])
def list_registrations(
    event_id: str,
    include_duplicates: bool = True,
    db: Session = Depends(get_db),
) -> list[models.Registration]:
    if db.get(models.Event, event_id) is None:
        raise HTTPException(status_code=404, detail="event not found")

    q = select(models.Registration).where(models.Registration.event_id == event_id)
    if not include_duplicates:
        q = q.where(models.Registration.is_duplicate.is_(False))
    q = q.order_by(models.Registration.created_at.desc())
    return list(db.scalars(q).all())
