"""Pydantic request/response schemas."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator


class EventCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    location: str | None = Field(default=None, max_length=200)
    operator: str | None = Field(default=None, max_length=200)


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    location: str | None
    operator: str | None
    created_at: datetime


class RegistrationCreate(BaseModel):
    """Attendee registration payload.

    The client must provide EITHER:
      - precomputed ``fingerprint_sha256`` and ``fingerprint_dhash``, OR
      - a ``fingerprint_image_b64`` from which the server derives both.
    """

    full_name: str = Field(min_length=1, max_length=200)
    national_id: str = Field(min_length=3, max_length=64)
    phone: str = Field(min_length=5, max_length=32)

    fingerprint_sha256: str | None = Field(
        default=None, min_length=64, max_length=64, pattern=r"^[0-9a-fA-F]{64}$"
    )
    fingerprint_dhash: str | None = Field(
        default=None, min_length=16, max_length=16, pattern=r"^[0-9a-fA-F]{16}$"
    )
    fingerprint_image_b64: str | None = None

    @model_validator(mode="after")
    def _require_fingerprint(self) -> RegistrationCreate:
        has_hashes = self.fingerprint_sha256 and self.fingerprint_dhash
        if not has_hashes and not self.fingerprint_image_b64:
            raise ValueError(
                "must provide either fingerprint_image_b64 or both "
                "fingerprint_sha256 and fingerprint_dhash"
            )
        return self


class DuplicateInfo(BaseModel):
    reason: str
    matched_registration_id: str
    matched_field: str


class RegistrationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    event_id: str
    full_name: str
    national_id: str
    phone: str
    fingerprint_sha256: str
    fingerprint_dhash: str
    is_duplicate: bool
    duplicate_reason: str | None
    duplicate_of_id: str | None
    created_at: datetime


class RegistrationCreateResponse(BaseModel):
    registration: RegistrationOut
    duplicate: DuplicateInfo | None = None


class EventStats(BaseModel):
    event_id: str
    total: int
    unique: int
    duplicates: int
